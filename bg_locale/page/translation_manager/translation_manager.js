frappe.pages["translation-manager"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "Translation Manager",
    single_column: true,
  });

  const state = {
    language: "bg",
    search: "",
    missing_only: 0,
    limit: 200,
    offset: 0,
    dirty: new Map(), // key: row.name or synthetic key
  };

  const $controls = $(`
    <div class="row" style="margin-bottom: 12px;">
      <div class="col-sm-2">
        <label>Language</label>
        <input class="form-control" type="text" value="bg" data-field="language" />
      </div>
      <div class="col-sm-6">
        <label>Search (source contains)</label>
        <input class="form-control" type="text" placeholder="e.g. Submit, Customer..." data-field="search" />
      </div>
      <div class="col-sm-2">
        <label>&nbsp;</label>
        <div class="checkbox">
          <label><input type="checkbox" data-field="missing_only" /> Missing only</label>
        </div>
      </div>
      <div class="col-sm-2" style="display:flex; gap:8px; align-items:flex-end;">
        <button class="btn btn-primary" data-action="reload">Reload</button>
        <button class="btn btn-success" data-action="save">Save</button>
      </div>
    </div>
  `);

  $(page.body).append($controls);

  const $tableWrap = $(`<div></div>`);
  $(page.body).append($tableWrap);

  let dt = null;

  function getControl(name) {
    return $controls.find(`[data-field="${name}"]`);
  }

  async function loadRows() {
    state.language = (getControl("language").val() || "bg").trim();
    state.search = (getControl("search").val() || "").trim();
    state.missing_only = getControl("missing_only").is(":checked") ? 1 : 0;

    const r = await frappe.call({
      method: "bg_locale.bg_locale.page.translation_manager.translation_manager.get_translations",
      args: {
        language: state.language,
        search: state.search,
        missing_only: state.missing_only,
        limit: state.limit,
        offset: state.offset,
      },
      freeze: true,
      freeze_message: "Loading translations...",
    });

    const rows = (r.message && r.message.rows) || [];

    renderTable(rows);
  }

  function renderTable(rows) {
    $tableWrap.empty();

    const data = rows.map((x) => ({
      name: x.name,
      source_text: x.source_text,
      translated_text: x.translated_text || "",
      context: x.context || "",
      modified: x.modified,
    }));

    const columns = [
      { name: "source_text", label: "Source Text", width: 420 },
      { name: "translated_text", label: "Translated Text (edit)", width: 420, editable: true },
      { name: "context", label: "Context", width: 160 },
      { name: "modified", label: "Modified", width: 160 },
    ];

    dt = new frappe.DataTable($tableWrap.get(0), {
      columns,
      data,
      layout: "fixed",
      inlineFilters: false,
      noDataMessage: "No translations found.",
      cellHeight: 42,
      dynamicRowHeight: true,
      events: {
        onCellEdit: function (cell, value) {
          const row = dt.datamanager.getRow(cell.rowIndex);
          // Track dirty changes by Translation docname
          state.dirty.set(row.name, {
            name: row.name,
            source_text: row.source_text,
            translated_text: row.translated_text,
            context: row.context,
          });
        },
      },
    });
  }

  async function saveDirty() {
    if (state.dirty.size === 0) {
      frappe.msgprint("Nothing to save.");
      return;
    }

    const items = Array.from(state.dirty.values());

    for (const item of items) {
      await frappe.call({
        method: "bg_locale.bg_locale.page.translation_manager.translation_manager.upsert_translation",
        args: {
          language: state.language,
          source_text: item.source_text,
          translated_text: item.translated_text,
          context: item.context || null,
        },
        freeze: true,
        freeze_message: "Saving...",
      });
    }

    state.dirty.clear();
    frappe.show_alert({ message: "Saved.", indicator: "green" });
    await loadRows();
  }

  $controls.on("click", '[data-action="reload"]', () => loadRows());
  $controls.on("click", '[data-action="save"]', () => saveDirty());

  // initial load
  loadRows();
};
