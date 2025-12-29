import frappe
from frappe import _


def _is_allowed():
    # MVP: only System Manager
    return "System Manager" in frappe.get_roles(frappe.session.user)


@frappe.whitelist()
def get_translations(language="bg", search="", missing_only=0, limit=200, offset=0):
    if not _is_allowed():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    missing_only = int(missing_only or 0)
    limit = min(int(limit or 200), 500)
    offset = max(int(offset or 0), 0)

    filters = {"language": language}
    # Show only rows that exist in Translation table.
    # "Missing only" means translated_text empty.
    if missing_only:
        filters["translated_text"] = ["in", ["", None]]

    # search in source_text
    search = (search or "").strip()
    or_filters = None
    if search:
        # OR filters require query builder or get_all with "or_filters"
        or_filters = [{"source_text": ["like", f"%{search}%"]}]

    rows = frappe.get_all(
        "Translation",
        filters=filters,
        or_filters=or_filters,
        fields=["name", "language", "source_text", "translated_text", "context", "modified"],
        order_by="modified desc",
        limit_start=offset,
        limit_page_length=limit,
    )

    return {"rows": rows}


@frappe.whitelist()
def upsert_translation(language, source_text, translated_text, context=None):
    if not _is_allowed():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    language = (language or "").strip()
    source_text = (source_text or "").strip()
    translated_text = (translated_text or "").strip()
    context = (context or "").strip() or None

    if not language or not source_text:
        frappe.throw(_("Language and Source Text are required."))

    existing = frappe.get_all(
        "Translation",
        filters={"language": language, "source_text": source_text, "context": context},
        fields=["name"],
        limit=1,
    )

    if existing:
        doc = frappe.get_doc("Translation", existing[0]["name"])
        doc.translated_text = translated_text
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.get_doc(
            {
                "doctype": "Translation",
                "language": language,
                "source_text": source_text,
                "translated_text": translated_text,
                "context": context,
            }
        )
        doc.insert(ignore_permissions=True)

    # Make changes show up immediately
    frappe.clear_cache()

    return {"ok": True, "name": doc.name}
