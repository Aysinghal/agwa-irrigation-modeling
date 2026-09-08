 /***********************************************
 * SCRIPT 7: NEGATIVE LABELING / REJECT WORKFLOW
 *
 * Clone of Script 2 (labeling.js) with the drawing tools removed. The CDL
 * field polygon IS the candidate, so there is nothing to draw — the labeler
 * just looks at the field on NAIP and decides:
 *
 *   Confirm Negative  -> field is empty cropland, no truss. Saves the field
 *                        geometry as a confirmed negative label.
 *   Reject            -> field actually has a truss / is unusable. Saves a
 *                        progress marker only (reason required).
 *
 * Same per-user batch workflow as Script 2: label up to 10, run the Tasks,
 * click "Tasks Completed", repeat.
 ***********************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USER = 'Ayush';  // change per person
USER = USER.toLowerCase();

var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];

var ASSIGNMENTS_ASSET =
  'projects/irrigation-mapping-agwa/assets/assignments/negative_field_assignments_md_v1';

var LABELS_BASE =
  'projects/irrigation-mapping-agwa/assets/labels_negative/';

var PROGRESS_BASE =
  'projects/irrigation-mapping-agwa/assets/progress_negative/';

var LABELS_USER_FOLDER = LABELS_BASE + USER;
var PROGRESS_USER_FOLDER = PROGRESS_BASE + USER;

var BATCH_LIMIT = 10;

// ---------------------------
// ENSURE USER FOLDERS EXIST
// ---------------------------
function ensureFolder(path) {
  // Strip any trailing slash — asset ids must not end in '/'.
  path = path.replace(/\/+$/, '');
  try {
    ee.data.getAsset(path);
  } catch (e) {
    ee.data.createAsset({type: 'Folder'}, path);
  }
}

// Create the base folders BEFORE the per-user subfolders — you can't create
// labels_negative/<user> until labels_negative itself exists.
ensureFolder(LABELS_BASE);
ensureFolder(PROGRESS_BASE);
ensureFolder(LABELS_BASE + USER);
ensureFolder(PROGRESS_BASE + USER);

// ---------------------------
// LOAD BASE DATA
// ---------------------------
var maryland = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.eq('NAME', 'Maryland'));

var naipMD = ee.ImageCollection('USDA/NAIP/DOQQ')
  .filterBounds(maryland)
  .filterDate('2021-01-01', '2023-12-31')
  .mosaic()
  .clip(maryland);

var assignmentsAll = ee.FeatureCollection(ASSIGNMENTS_ASSET);
var myAssignments = assignmentsAll
  .filter(ee.Filter.eq('assigned_to', USER))
  .sort('queue_index');

// ---------------------------
// MAP LAYERS
// ---------------------------
Map.centerObject(maryland, 7);
Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'Maryland NAIP');
Map.addLayer(maryland, {color: 'blue'}, 'Maryland boundary', false);
Map.addLayer(myAssignments, {color: 'yellow'}, 'My assigned fields', false);

// ---------------------------
// UI
// ---------------------------
var STYLE = {
  divider: {height: '2px', backgroundColor: '#ccc', margin: '10px 0 10px 0'},
  sectionHeader: {fontWeight: 'bold', fontSize: '13px', color: '#333', margin: '4px 0 2px 0'},
  statusReady: {color: '#2e7d32', fontWeight: 'bold', fontSize: '13px'},
  statusError: {color: '#c62828', fontWeight: 'bold', fontSize: '13px'},
  statusLoading: {color: '#ef6c00', fontWeight: 'bold', fontSize: '13px'},
  statusNeutral: {color: '#555', fontWeight: 'bold', fontSize: '13px'}
};

function makeDivider() {
  return ui.Label('', STYLE.divider);
}

var title = ui.Label('Negative Field Labeling', {
  fontWeight: 'bold',
  fontSize: '20px',
  color: '#1a237e',
  margin: '8px 0 0 0'
});
var userLabel = ui.Label('Labeler: ' + USER.charAt(0).toUpperCase() + USER.slice(1), {
  fontSize: '14px',
  color: '#444',
  margin: '0 0 4px 0'
});

var statusLabel = ui.Label('Loading assignments...', STYLE.statusLoading);
var currentFieldLabel = ui.Label('Current field: pending', {
  fontSize: '12px', color: '#555'
});
var progressLabel = ui.Label('Progress: pending', {
  fontSize: '12px', color: '#555'
});
var sessionLabel = ui.Label('', {
  fontSize: '12px', color: '#ef6c00'
});

function updateSessionLabel() {
  if (sessionDoneIds.length === 0) {
    sessionLabel.setValue('');
  } else {
    sessionLabel.setValue(
      sessionDoneIds.length + ' field(s) with unsaved tasks — run tasks before closing.'
    );
  }
}

function setStatus(message, type) {
  statusLabel.setValue(message);
  if (type === 'error') {
    statusLabel.style().set(STYLE.statusError);
  } else if (type === 'ready') {
    statusLabel.style().set(STYLE.statusReady);
  } else if (type === 'loading') {
    statusLabel.style().set(STYLE.statusLoading);
  } else {
    statusLabel.style().set(STYLE.statusNeutral);
  }
}

var instructions = ui.Label(
  '1. Look at the highlighted field on NAIP.\n' +
  '2. No truss / empty cropland -> "Confirm Negative".\n' +
  '3. Truss present or unusable -> enter a reason, "Reject".\n' +
  '4. After up to 10 fields, run tasks in the Tasks tab.\n' +
  '5. Click "Tasks Completed" to continue.',
  {fontSize: '12px', color: '#555', whiteSpace: 'pre'}
);

var refreshButton = ui.Button({
  label: 'Refresh',
  onClick: refreshState,
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var recenterButton = ui.Button({
  label: 'Recenter',
  onClick: function() {
    if (!currentField) {
      setStatus('No field loaded to recenter on.', 'error');
      return;
    }
    Map.centerObject(currentField, 17);
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var notesBox = ui.Textbox({
  placeholder: 'Reason (required to reject, optional to confirm)',
  style: {stretch: 'horizontal'}
});

var confirmPanel = ui.Panel({style: {stretch: 'horizontal'}});

function showConfirmation(message, onConfirm) {
  confirmPanel.clear();
  confirmPanel.add(ui.Label(message, {
    fontSize: '12px', fontWeight: 'bold', color: '#c62828'
  }));
  var confirmRow = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'}
  });
  confirmRow.add(ui.Button({
    label: 'Confirm',
    onClick: function() {
      confirmPanel.clear();
      onConfirm();
    },
    style: {stretch: 'horizontal', fontWeight: 'bold'}
  }));
  confirmRow.add(ui.Button({
    label: 'Cancel',
    onClick: function() {
      confirmPanel.clear();
      setStatus('Cancelled.', 'neutral');
    },
    style: {stretch: 'horizontal'}
  }));
  confirmPanel.add(confirmRow);
}

var confirmNegativeButton = ui.Button({
  label: 'Confirm Negative',
  onClick: function() {
    if (sessionDoneIds.length >= BATCH_LIMIT) {
      setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
      return;
    }
    if (!currentField || currentFieldId === null) {
      setStatus('No current field selected. Click "Refresh" first.', 'error');
      return;
    }
    showConfirmation(
      'Confirm field ' + currentFieldId + ' as a negative (no truss)?',
      queueConfirmExport
    );
  },
  style: {stretch: 'horizontal', fontWeight: 'bold', color: '#2e7d32'}
});

var rejectButton = ui.Button({
  label: 'Reject',
  onClick: function() {
    if (sessionDoneIds.length >= BATCH_LIMIT) {
      setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
      return;
    }
    if (!currentField || currentFieldId === null) {
      setStatus('No current field selected. Click "Refresh" first.', 'error');
      return;
    }
    var noteValue = notesBox.getValue() || '';
    if (!noteValue.trim()) {
      setStatus('A reason is required in the Notes box to reject a field.', 'error');
      return;
    }
    showConfirmation(
      'Reject field ' + currentFieldId + '?',
      queueRejectExport
    );
  },
  style: {stretch: 'horizontal', color: '#c62828'}
});

var actionButtonRow = ui.Panel({
  widgets: [confirmNegativeButton, rejectButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});

var tasksCompletedButton = ui.Button({
  label: 'Tasks Completed',
  onClick: function() {
    sessionDoneIds = [];
    sessionConfirmedIds = [];
    updateSessionLabel();
    refreshState();
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var utilityRow = ui.Panel({
  widgets: [tasksCompletedButton, refreshButton, recenterButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});

var panel = ui.Panel({
  widgets: [
    title,
    userLabel,
    makeDivider(),
    ui.Label('Status', STYLE.sectionHeader),
    statusLabel,
    currentFieldLabel,
    progressLabel,
    sessionLabel,
    makeDivider(),
    ui.Label('Instructions', STYLE.sectionHeader),
    instructions,
    makeDivider(),
    ui.Label('Decision', STYLE.sectionHeader),
    notesBox,
    actionButtonRow,
    confirmPanel,
    makeDivider(),
    ui.Label('Utilities', STYLE.sectionHeader),
    utilityRow
  ],
  style: {width: '380px', padding: '10px'}
});

ui.root.insert(0, panel);

// ---------------------------
// STATE
// ---------------------------
var currentField = null;
var currentFieldId = null;
var currentQueueIndex = null;
var currentTargetCompleted = null;
var sessionDoneIds = [];
var sessionConfirmedIds = [];

// ---------------------------
// HELPERS
// ---------------------------
function getDoneFieldIdsFromProgressFolder() {
  // Reads all progress assets in the user's folder and parses field IDs.
  // Expected naming:
  //   field_<id>_confirmed
  //   field_<id>_rejected
  var result = ee.data.listAssets(PROGRESS_USER_FOLDER);
  if (!result || !result.assets) return [];

  var ids = [];
  result.assets.forEach(function(asset) {
    var name = asset.id.split('/').pop();
    var match = name.match(/^field_(\d+)_(confirmed|rejected)$/);
    if (match) {
      ids.push(parseInt(match[1], 10));
    }
  });
  return ids;
}

function getConfirmedFieldIdsFromProgressFolder() {
  var result = ee.data.listAssets(PROGRESS_USER_FOLDER);
  if (!result || !result.assets) return [];

  var ids = [];
  result.assets.forEach(function(asset) {
    var name = asset.id.split('/').pop();
    var match = name.match(/^field_(\d+)_confirmed$/);
    if (match) {
      ids.push(parseInt(match[1], 10));
    }
  });
  return ids;
}

function refreshState() {
  setStatus('Refreshing...', 'loading');

  var serverDoneIds = getDoneFieldIdsFromProgressFolder();
  var serverConfirmedIds = getConfirmedFieldIdsFromProgressFolder();

  var serverDoneSet = {};
  serverDoneIds.forEach(function(id) { serverDoneSet[id] = true; });
  var serverConfirmedSet = {};
  serverConfirmedIds.forEach(function(id) { serverConfirmedSet[id] = true; });

  sessionDoneIds = sessionDoneIds.filter(function(id) { return !serverDoneSet[id]; });
  sessionConfirmedIds = sessionConfirmedIds.filter(function(id) { return !serverConfirmedSet[id]; });
  updateSessionLabel();

  var allDoneIdsSet = {};
  serverDoneIds.forEach(function(id) { allDoneIdsSet[id] = true; });
  sessionDoneIds.forEach(function(id) { allDoneIdsSet[id] = true; });
  var allDoneIds = Object.keys(allDoneIdsSet).map(Number);

  var allConfirmedIdsSet = {};
  serverConfirmedIds.forEach(function(id) { allConfirmedIdsSet[id] = true; });
  sessionConfirmedIds.forEach(function(id) { allConfirmedIdsSet[id] = true; });
  var confirmedCount = Object.keys(allConfirmedIdsSet).length;

  // Key off global_rank: it's the stable per-field id present in every
  // version of the assignment asset (field_id was added later).
  var myRemaining = allDoneIds.length > 0
    ? myAssignments.filter(ee.Filter.inList('global_rank', allDoneIds).not())
    : myAssignments;

  myAssignments.size().evaluate(function(totalAssigned) {
    myRemaining.size().evaluate(function(remainingCount) {
      // Denominator = this user's total assigned fields (their weight),
      // so we don't depend on an n_target property existing.
      currentTargetCompleted = totalAssigned;

      progressLabel.setValue(
        'Progress: ' + confirmedCount + ' / ' + totalAssigned +
        ' confirmed | ' + remainingCount + ' remaining assigned fields'
      );

      if (remainingCount === 0) {
        setStatus('All assigned fields reviewed. Done!', 'ready');
        currentFieldLabel.setValue('Current field: none');
        currentField = null;
        currentFieldId = null;
        currentQueueIndex = null;
        return;
      }

      var nextField = myRemaining.sort('queue_index').first();

      nextField.evaluate(function(f) {
        if (!f) {
          setStatus('No remaining assigned fields found.', 'error');
          currentFieldLabel.setValue('Current field: none');
          currentField = null;
          currentFieldId = null;
          currentQueueIndex = null;
          return;
        }

        currentField = ee.Feature(nextField);
        currentFieldId = f.properties.global_rank;
        currentQueueIndex = f.properties.queue_index;

        setStatus('Ready — confirm or reject this field.', 'ready');
        currentFieldLabel.setValue(
          'Current field_id: ' + currentFieldId +
          ' | queue_index: ' + currentQueueIndex +
          ' | crop_class: ' + f.properties.crop_class
        );

        refreshMapForCurrentField();
      });
    });
  });
}

function refreshMapForCurrentField() {
  if (!currentField) return;

  Map.layers().reset();

  Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'Maryland NAIP');
  Map.addLayer(myAssignments, {color: 'yellow'}, 'My assigned fields', false);

  // Outline the current field so the labeler sees its exact boundary.
  var outline = ee.Image().byte().paint({
    featureCollection: ee.FeatureCollection([currentField]),
    color: 1,
    width: 3
  });
  Map.addLayer(outline, {palette: ['red']}, 'Current field outline');

  Map.centerObject(currentField, 17);
}

function buildProgressFeature(statusValue, noteValue) {
  return ee.Feature(currentField.geometry(), {
    field_id: currentFieldId,
    labeler: USER,
    timestamp: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss'),
    status: statusValue,
    notes: noteValue || '',
    queue_index: currentQueueIndex
  });
}

function queueConfirmExport() {
  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
    return;
  }
  if (!currentField || currentFieldId === null) {
    setStatus('No current field selected. Click "Refresh" first.', 'error');
    return;
  }

  var noteValue = notesBox.getValue() || '';

  // The label is the CDL field geometry itself, tagged as a confirmed negative.
  var labelFeature = ee.Feature(currentField.geometry(), {
    field_id: currentFieldId,
    labeler: USER,
    timestamp: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss'),
    status: 'confirmed',
    label_class: 0,            // 0 = negative (no truss)
    notes: noteValue,
    queue_index: currentQueueIndex
  });

  var labelCollection = ee.FeatureCollection([labelFeature]);
  var progressCollection = ee.FeatureCollection([
    buildProgressFeature('confirmed', noteValue)
  ]);

  var labelAssetId =
    LABELS_USER_FOLDER + '/field_' + currentFieldId + '_confirmed';
  var progressAssetId =
    PROGRESS_USER_FOLDER + '/field_' + currentFieldId + '_confirmed';

  Export.table.toAsset({
    collection: labelCollection,
    description: 'neg_label_field_' + currentFieldId,
    assetId: labelAssetId
  });

  Export.table.toAsset({
    collection: progressCollection,
    description: 'neg_progress_field_' + currentFieldId + '_confirmed',
    assetId: progressAssetId
  });

  sessionDoneIds.push(currentFieldId);
  sessionConfirmedIds.push(currentFieldId);
  notesBox.setValue('');
  updateSessionLabel();

  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
  } else {
    refreshState();
  }
}

function queueRejectExport() {
  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
    return;
  }
  if (!currentField || currentFieldId === null) {
    setStatus('No current field selected. Click "Refresh" first.', 'error');
    return;
  }

  var noteValue = notesBox.getValue() || '';
  if (!noteValue.trim()) {
    setStatus('A reason is required in the Notes box to reject a field.', 'error');
    return;
  }

  var progressCollection = ee.FeatureCollection([
    buildProgressFeature('rejected', noteValue)
  ]);

  var progressAssetId =
    PROGRESS_USER_FOLDER + '/field_' + currentFieldId + '_rejected';

  Export.table.toAsset({
    collection: progressCollection,
    description: 'neg_progress_field_' + currentFieldId + '_rejected',
    assetId: progressAssetId
  });

  sessionDoneIds.push(currentFieldId);
  notesBox.setValue('');
  updateSessionLabel();

  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
  } else {
    refreshState();
  }
}

// Initial load
refreshState();
