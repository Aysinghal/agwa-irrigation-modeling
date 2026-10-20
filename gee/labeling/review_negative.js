/***********************************************
 * SCRIPT 12: NEGATIVE RE-CHECK (ROUND 2, QUEUE B)
 *
 * Clone of Script 11 with the pivot overlay removed. Everything else — four
 * answers, a label asset written for every one of them, assets named by
 * queue_index, batches of ten — is identical and documented there.
 *
 * No overlay, because the question is different. Queue A asks "is the reported
 * pivot on THIS field", so it shows the pivot. Queue B asks "is there a truss
 * here at all", and the trusses being looked for are the ones the legacy map
 * never recorded (2026-09-17-negative-pass-rejections). There is nothing to
 * draw, and drawing the nearest unrelated pivot would invent a prior where the
 * point is that none exists.
 *
 * These 933 fields were each confirmed truss-free once already, by a different
 * labeler. That earlier answer is deliberately not shown: a labeler told "the
 * last person saw nothing" is being asked to agree rather than to look.
 ***********************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USER = 'Ayush';  // change per person
USER = USER.toLowerCase();

var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];

var QUEUE = 'B';

var ASSIGNMENTS_ASSET =
  'projects/irrigation-mapping-agwa/assets/assignments/review_queues_md_v2';

var LABELS_BASE =
  'projects/irrigation-mapping-agwa/assets/review_labels_b/';
var PROGRESS_BASE =
  'projects/irrigation-mapping-agwa/assets/review_progress_b/';

var LABELS_USER_FOLDER = LABELS_BASE + USER;
var PROGRESS_USER_FOLDER = PROGRESS_BASE + USER;

var BATCH_LIMIT = 10;

// label_class is a numeric mirror of `answer`; `answer` is authoritative.
var ANSWERS = {
  yes:      {asset: 'yes',      label_class: 1,  needsNote: false},
  no:       {asset: 'no',       label_class: 0,  needsNote: false},
  unsure:   {asset: 'unsure',   label_class: -1, needsNote: true},
  notfield: {asset: 'notfield', label_class: -1, needsNote: true}
};

// ---------------------------
// ENSURE USER FOLDERS EXIST
// ---------------------------
function ensureFolder(path) {
  path = path.replace(/\/+$/, '');
  try {
    ee.data.getAsset(path);
  } catch (e) {
    ee.data.createAsset({type: 'Folder'}, path);
  }
}

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

var myAssignments = ee.FeatureCollection(ASSIGNMENTS_ASSET)
  .filter(ee.Filter.eq('assigned_to', USER))
  .filter(ee.Filter.eq('queue', QUEUE))
  .sort('queue_index');

// ---------------------------
// MAP LAYERS
// ---------------------------
Map.centerObject(maryland, 7);
Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'Maryland NAIP');
Map.addLayer(maryland, {color: 'blue'}, 'Maryland boundary', false);

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

var title = ui.Label('Negative Re-Check', {
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
  if (sessionDoneIdx.length === 0) {
    sessionLabel.setValue('');
  } else {
    sessionLabel.setValue(
      sessionDoneIdx.length + ' field(s) with unsaved tasks — run tasks before closing.'
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
  'The red outline is the field. Look over the whole of it, including the\n' +
  'edges — a pivot arm can sit mostly on a neighbour.\n' +
  '\n' +
  'Is there a centre-pivot truss on THIS field?\n' +
  '  Yes            a truss is on this field\n' +
  '  No             looked, no truss on it\n' +
  '  Unsure         cannot tell from this imagery (note required)\n' +
  '  Not a field    house, woods, road, solar farm (note required)\n' +
  '\n' +
  'Answer up to 10, run the Tasks tab, then "Tasks Completed".',
  {fontSize: '12px', color: '#555', whiteSpace: 'pre'}
);

var refreshButton = ui.Button({
  label: 'Refresh',
  onClick: function() { refreshState(); },
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

var zoomOutButton = ui.Button({
  label: 'Zoom Out',
  onClick: function() {
    if (!currentField) {
      setStatus('No field loaded.', 'error');
      return;
    }
    Map.centerObject(currentField, 15);
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var notesBox = ui.Textbox({
  placeholder: 'Note (required for Unsure and Not a field)',
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

function makeAnswerButton(label, answerKey, style) {
  return ui.Button({
    label: label,
    onClick: function() {
      if (sessionDoneIdx.length >= BATCH_LIMIT) {
        setStatus('Batch limit reached (' + BATCH_LIMIT +
          '). Run tasks, then click "Tasks Completed".', 'error');
        return;
      }
      if (!currentField || currentQueueIndex === null) {
        setStatus('No current field selected. Click "Refresh" first.', 'error');
        return;
      }
      var note = notesBox.getValue() || '';
      if (ANSWERS[answerKey].needsNote && !note.trim()) {
        setStatus('A note is required in the box above for "' + label + '".', 'error');
        return;
      }
      showConfirmation(
        'Record "' + label + '" for queue item ' + currentQueueIndex + '?',
        function() { queueAnswerExport(answerKey); }
      );
    },
    style: style
  });
}

var yesButton = makeAnswerButton('Yes', 'yes',
  {stretch: 'horizontal', fontWeight: 'bold', color: '#2e7d32'});
var noButton = makeAnswerButton('No', 'no',
  {stretch: 'horizontal', fontWeight: 'bold', color: '#1565c0'});
var unsureButton = makeAnswerButton('Unsure', 'unsure',
  {stretch: 'horizontal', color: '#ef6c00'});
var notFieldButton = makeAnswerButton('Not a field', 'notfield',
  {stretch: 'horizontal', color: '#6a1b9a'});

var answerRow1 = ui.Panel({
  widgets: [yesButton, noButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});
var answerRow2 = ui.Panel({
  widgets: [unsureButton, notFieldButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});

var tasksCompletedButton = ui.Button({
  label: 'Tasks Completed',
  onClick: function() {
    sessionDoneIdx = [];
    updateSessionLabel();
    refreshState();
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var utilityRow1 = ui.Panel({
  widgets: [tasksCompletedButton, refreshButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});
var utilityRow2 = ui.Panel({
  widgets: [recenterButton, zoomOutButton],
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
    ui.Label('Note', STYLE.sectionHeader),
    notesBox,
    ui.Label('Answer', STYLE.sectionHeader),
    answerRow1,
    answerRow2,
    confirmPanel,
    makeDivider(),
    ui.Label('Utilities', STYLE.sectionHeader),
    utilityRow1,
    utilityRow2
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
var sessionDoneIdx = [];

// ---------------------------
// HELPERS
// ---------------------------
function getDoneQueueIndicesFromProgressFolder() {
  // Progress assets are named item_<queue_index>_<answer>. See Script 11 for
  // why queue_index rather than field_id.
  var result = ee.data.listAssets(PROGRESS_USER_FOLDER);
  if (!result || !result.assets) return [];

  var idx = [];
  result.assets.forEach(function(asset) {
    var name = asset.id.split('/').pop();
    var match = name.match(/^item_(\d+)_(yes|no|unsure|notfield)$/);
    if (match) {
      idx.push(parseInt(match[1], 10));
    }
  });
  return idx;
}

function refreshState() {
  setStatus('Refreshing...', 'loading');

  var serverDone = getDoneQueueIndicesFromProgressFolder();

  var serverDoneSet = {};
  serverDone.forEach(function(i) { serverDoneSet[i] = true; });

  sessionDoneIdx = sessionDoneIdx.filter(function(i) { return !serverDoneSet[i]; });
  updateSessionLabel();

  var allDoneSet = {};
  serverDone.forEach(function(i) { allDoneSet[i] = true; });
  sessionDoneIdx.forEach(function(i) { allDoneSet[i] = true; });
  var allDone = Object.keys(allDoneSet).map(Number);
  var answeredCount = allDone.length;

  var myRemaining = allDone.length > 0
    ? myAssignments.filter(ee.Filter.inList('queue_index', allDone).not())
    : myAssignments;

  myAssignments.size().evaluate(function(totalAssigned) {
    myRemaining.size().evaluate(function(remainingCount) {
      progressLabel.setValue(
        'Progress: ' + answeredCount + ' / ' + totalAssigned +
        ' answered | ' + remainingCount + ' remaining'
      );

      if (remainingCount === 0) {
        setStatus('All assigned fields answered. Done!', 'ready');
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
        currentFieldId = f.properties.field_id;
        currentQueueIndex = f.properties.queue_index;

        setStatus('Ready — is there a truss on this field?', 'ready');
        currentFieldLabel.setValue(
          'item ' + currentQueueIndex +
          ' | crop_class: ' + f.properties.crop_class +
          ' | ' + (f.properties.area_m2 / 10000).toFixed(1) + ' ha'
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

  var outline = ee.Image().byte().paint({
    featureCollection: ee.FeatureCollection([currentField]),
    color: 1,
    width: 3
  });
  Map.addLayer(outline, {palette: ['red']}, 'Current field outline');

  Map.centerObject(currentField, 17);
}

function queueAnswerExport(answerKey) {
  if (sessionDoneIdx.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT +
      '). Run tasks, then click "Tasks Completed".', 'error');
    return;
  }
  if (!currentField || currentQueueIndex === null) {
    setStatus('No current field selected. Click "Refresh" first.', 'error');
    return;
  }

  var spec = ANSWERS[answerKey];
  var note = notesBox.getValue() || '';
  if (spec.needsNote && !note.trim()) {
    setStatus('A note is required for this answer.', 'error');
    return;
  }

  var props = {
    field_id: currentFieldId,
    queue: QUEUE,
    queue_index: currentQueueIndex,
    labeler: USER,
    timestamp: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss'),
    answer: answerKey,
    label_class: spec.label_class,
    notes: note,
    round: 2
  };

  // Every answer writes a label, "no" included. See Script 11.
  var labelCollection = ee.FeatureCollection([
    ee.Feature(currentField.geometry(), props)
  ]);
  var progressCollection = ee.FeatureCollection([
    ee.Feature(currentField.geometry(), props)
  ]);

  var stem = 'item_' + currentQueueIndex + '_' + spec.asset;

  Export.table.toAsset({
    collection: labelCollection,
    description: 'reviewB_label_' + stem,
    assetId: LABELS_USER_FOLDER + '/' + stem
  });

  Export.table.toAsset({
    collection: progressCollection,
    description: 'reviewB_progress_' + stem,
    assetId: PROGRESS_USER_FOLDER + '/' + stem
  });

  sessionDoneIdx.push(currentQueueIndex);
  notesBox.setValue('');
  updateSessionLabel();

  if (sessionDoneIdx.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT +
      '). Run tasks, then click "Tasks Completed".', 'error');
  } else {
    refreshState();
  }
}

// Initial load
refreshState();
