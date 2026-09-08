 /***********************************************
 * SCRIPT 2: SHARED LABELING / SKIP WORKFLOW
 ***********************************************/

// ---------------------------
// CONFIG
// ---------------------------
var USER = 'Ayush';  // change per person
USER = USER.toLowerCase();

var USERS = ['ayush', 'maddie', 'mara', 'mike', 'sienna', 'taryn', 'tien'];

var ASSIGNMENTS_ASSET =
  'projects/irrigation-mapping-agwa/assets/assignments/truss_point_assignments_md_v1';

var LABELS_BASE =
  'projects/irrigation-mapping-agwa/assets/labels/';

var PROGRESS_BASE =
  'projects/irrigation-mapping-agwa/assets/progress/';

var LABELS_USER_FOLDER = LABELS_BASE + USER;
var PROGRESS_USER_FOLDER = PROGRESS_BASE + USER;

// Optional: old reference dataset
var SOURCE_PIVOTS =
  'projects/irrigation-mapping-agwa/assets/center_pivot_irrigation_trusses';

var SHOW_REFERENCE = true;
var BATCH_LIMIT = 10;

// ---------------------------
// ENSURE USER FOLDERS EXIST
// ---------------------------
function ensureFolder(path) {
  try {
    ee.data.getAsset(path);
  } catch (e) {
    ee.data.createAsset({type: 'Folder'}, path);
  }
}

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

var sourcePivots = ee.FeatureCollection(SOURCE_PIVOTS);

// ---------------------------
// MAP LAYERS
// ---------------------------
Map.centerObject(maryland, 7);
Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'Maryland NAIP');
Map.addLayer(maryland, {color: 'blue'}, 'Maryland boundary', false);

if (SHOW_REFERENCE) {
  Map.addLayer(sourcePivots, {color: 'cyan'}, 'Old reference polygons', false);
}

Map.addLayer(myAssignments, {color: 'yellow'}, 'My assigned points', false);

// ---------------------------
// DRAWING TOOLS SETUP
// ---------------------------
var drawingTools = Map.drawingTools();
drawingTools.setShown(true);

// Clear any existing drawing layers and create one fresh layer for labeling.
while (drawingTools.layers().length() > 0) {
  drawingTools.layers().remove(drawingTools.layers().get(0));
}

var drawLayer = ui.Map.GeometryLayer({
  geometries: null,
  name: 'FieldPolygon',
  color: 'red'
});
drawingTools.layers().add(drawLayer);
drawingTools.setDrawModes(['polygon']);

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

var title = ui.Label('Truss Field Labeling', {
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
var currentPointLabel = ui.Label('Current point: pending', {
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
      sessionDoneIds.length + ' point(s) with unsaved tasks — run tasks before closing.'
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
  '1. Draw a field polygon, then click "Submit Label".\n' +
  '2. If unusable, enter a reason and click "Skip Point".\n' +
  '3. After up to 10 points, run tasks in the Tasks tab.\n' +
  '4. Click "Tasks Completed" to continue labeling.',
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
    if (!currentPoint) {
      setStatus('No point loaded to recenter on.', 'error');
      return;
    }
    Map.centerObject(currentPoint, 18);
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var startDrawButton = ui.Button({
  label: 'Start Drawing',
  onClick: function() {
    drawingTools.setShape('polygon');
    drawingTools.draw();
  },
  style: {stretch: 'horizontal'}
});

var clearDrawButton = ui.Button({
  label: 'Clear Drawing',
  onClick: function() {
    var layer = drawingTools.layers().get(0);
    layer.geometries().reset([]);
    setStatus('Drawing cleared.', 'neutral');
  },
  style: {stretch: 'horizontal'}
});

var drawButtonRow = ui.Panel({
  widgets: [startDrawButton, clearDrawButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});

var notesBox = ui.Textbox({
  placeholder: 'Notes (required for skip, optional for complete)',
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

var completedButton = ui.Button({
  label: 'Submit Label',
  onClick: function() {
    if (sessionDoneIds.length >= BATCH_LIMIT) {
      setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
      return;
    }
    if (!currentPoint || currentPointId === null) {
      setStatus('No current point selected. Click "Refresh" first.', 'error');
      return;
    }
    var geom = getSingleDrawnGeometry();
    if (!geom) {
      setStatus('Draw exactly one polygon before submitting.', 'error');
      return;
    }
    showConfirmation(
      'Submit label for point ' + currentPointId + '?',
      queueCompletedExport
    );
  },
  style: {stretch: 'horizontal', fontWeight: 'bold', color: '#2e7d32'}
});

var skippedButton = ui.Button({
  label: 'Skip Point',
  onClick: function() {
    if (sessionDoneIds.length >= BATCH_LIMIT) {
      setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
      return;
    }
    if (!currentPoint || currentPointId === null) {
      setStatus('No current point selected. Click "Refresh" first.', 'error');
      return;
    }
    var noteValue = notesBox.getValue() || '';
    if (!noteValue.trim()) {
      setStatus('A reason is required in the Notes box to skip a point.', 'error');
      return;
    }
    showConfirmation(
      'Skip point ' + currentPointId + '?',
      queueSkippedExport
    );
  },
  style: {stretch: 'horizontal', color: '#c62828'}
});

var actionButtonRow = ui.Panel({
  widgets: [completedButton, skippedButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});

var tasksCompletedButton = ui.Button({
  label: 'Tasks Completed',
  onClick: function() {
    sessionDoneIds = [];
    sessionCompletedIds = [];
    updateSessionLabel();
    refreshState();
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var referenceVisible = true;
var toggleReferenceButton = ui.Button({
  label: 'Hide Reference',
  onClick: function() {
    referenceVisible = !referenceVisible;
    toggleReferenceButton.setLabel(
      referenceVisible ? 'Hide Reference' : 'Show Reference'
    );
    var layers = Map.layers();
    for (var i = 0; i < layers.length(); i++) {
      var layer = layers.get(i);
      if (layer.getName() === 'Parent reference polygon') {
        layer.setShown(referenceVisible);
      }
    }
  },
  style: {stretch: 'horizontal', fontSize: '11px', color: '#666'}
});

var utilityRow1 = ui.Panel({
  widgets: [tasksCompletedButton, refreshButton],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal'}
});

var utilityRow2 = ui.Panel({
  widgets: [recenterButton, toggleReferenceButton],
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
    currentPointLabel,
    progressLabel,
    sessionLabel,
    makeDivider(),
    ui.Label('Instructions', STYLE.sectionHeader),
    instructions,
    makeDivider(),
    ui.Label('Draw', STYLE.sectionHeader),
    drawButtonRow,
    makeDivider(),
    ui.Label('Notes', STYLE.sectionHeader),
    notesBox,
    actionButtonRow,
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
var currentPoint = null;
var currentPointId = null;
var currentQueueIndex = null;
var currentTargetCompleted = null;
var sessionDoneIds = [];
var sessionCompletedIds = [];

// ---------------------------
// HELPERS
// ---------------------------
function getDonePointIdsFromProgressFolder() {
  // Reads all progress assets in the user's folder and parses point IDs from names.
  // Expected naming:
  //   point_<id>_completed
  //   point_<id>_skipped
  //
  // This is client-side metadata lookup, which is fine for this workflow.
  var result = ee.data.listAssets(PROGRESS_USER_FOLDER);

  if (!result || !result.assets) return [];

  var ids = [];
  result.assets.forEach(function(asset) {
    var name = asset.id.split('/').pop();
    var match = name.match(/^point_(\d+)_(completed|skipped)$/);
    if (match) {
      ids.push(parseInt(match[1], 10));
    }
  });

  return ids;
}

function getCompletedPointIdsFromProgressFolder() {
  var result = ee.data.listAssets(PROGRESS_USER_FOLDER);

  if (!result || !result.assets) return [];

  var ids = [];
  result.assets.forEach(function(asset) {
    var name = asset.id.split('/').pop();
    var match = name.match(/^point_(\d+)_completed$/);
    if (match) {
      ids.push(parseInt(match[1], 10));
    }
  });

  return ids;
}

function resetDrawLayer() {
  var layer = drawingTools.layers().get(0);
  layer.geometries().reset([]);
}

function getSingleDrawnGeometry() {
  var layer = drawingTools.layers().get(0);
  var geoms = layer.geometries();

  if (geoms.length() !== 1) {
    return null;
  }
  return geoms.get(0);
}

function refreshState() {
  setStatus('Refreshing...', 'loading');

  var serverDoneIds = getDonePointIdsFromProgressFolder();
  var serverCompletedIds = getCompletedPointIdsFromProgressFolder();

  var serverDoneSet = {};
  serverDoneIds.forEach(function(id) { serverDoneSet[id] = true; });
  var serverCompletedSet = {};
  serverCompletedIds.forEach(function(id) { serverCompletedSet[id] = true; });

  sessionDoneIds = sessionDoneIds.filter(function(id) { return !serverDoneSet[id]; });
  sessionCompletedIds = sessionCompletedIds.filter(function(id) { return !serverCompletedSet[id]; });
  updateSessionLabel();

  var allDoneIdsSet = {};
  serverDoneIds.forEach(function(id) { allDoneIdsSet[id] = true; });
  sessionDoneIds.forEach(function(id) { allDoneIdsSet[id] = true; });
  var allDoneIds = Object.keys(allDoneIdsSet).map(Number);

  var allCompletedIdsSet = {};
  serverCompletedIds.forEach(function(id) { allCompletedIdsSet[id] = true; });
  sessionCompletedIds.forEach(function(id) { allCompletedIdsSet[id] = true; });
  var completedCount = Object.keys(allCompletedIdsSet).length;

  var doneFilter = allDoneIds.length > 0
    ? ee.Filter.inList('point_id', allDoneIds)
    : null;

  var myRemaining = doneFilter
    ? myAssignments.filter(ee.Filter.inList('point_id', allDoneIds).not())
    : myAssignments;

  myAssignments.size().evaluate(function(totalAssigned) {
    myRemaining.size().evaluate(function(remainingCount) {
      var target = null;

      myAssignments.first().get('n_target').evaluate(function(nTargetVal) {
        target = nTargetVal;
        currentTargetCompleted = target;

        progressLabel.setValue(
          'Progress: ' + completedCount + ' / ' + target +
          ' completed | ' + remainingCount + ' remaining assigned points'
        );

        if (completedCount >= target) {
          setStatus('Target reached! No more labels required.', 'ready');
          currentPointLabel.setValue('Current point: none');
          currentPoint = null;
          currentPointId = null;
          currentQueueIndex = null;
          return;
        }

        var nextPoint = myRemaining.sort('queue_index').first();

        nextPoint.evaluate(function(f) {
          if (!f) {
            setStatus('No remaining assigned points found.', 'error');
            currentPointLabel.setValue('Current point: none');
            currentPoint = null;
            currentPointId = null;
            currentQueueIndex = null;
            return;
          }

          currentPoint = ee.Feature(nextPoint);
          currentPointId = f.properties.point_id;
          currentQueueIndex = f.properties.queue_index;

          setStatus('Ready — draw a polygon or skip.', 'ready');
          currentPointLabel.setValue(
            'Current point_id: ' + currentPointId +
            ' | queue_index: ' + currentQueueIndex
          );

          // Visualize current point and nearby reference polygons
          refreshMapForCurrentPoint();
        });
      });
    });
  });
}

function refreshMapForCurrentPoint() {
  if (!currentPoint) return;

  Map.layers().reset();

  Map.addLayer(naipMD, {bands: ['R', 'G', 'B']}, 'Maryland NAIP');
  if (SHOW_REFERENCE) {
    Map.addLayer(sourcePivots, {color: 'cyan'}, 'Old reference polygons', false);
  }

  Map.addLayer(myAssignments, {color: 'yellow'}, 'My assigned points', false);
  Map.addLayer(
    ee.FeatureCollection([currentPoint]),
    {color: 'red'},
    'Current assigned point'
  );

  // Optional nearby reference subset
  if (SHOW_REFERENCE) {
    var candidates = sourcePivots.filterBounds(currentPoint.geometry().buffer(500));
    var withDist = candidates.map(function(f) {
      return f.set('_dist', f.geometry().centroid(1).distance(currentPoint.geometry()));
    });
    var parent = ee.FeatureCollection([withDist.sort('_dist').first()]);
    referenceVisible = true;
    toggleReferenceButton.setLabel('Hide Reference');
    Map.addLayer(parent, {color: 'lime'}, 'Parent reference polygon', true, 0.4);
  }

  Map.centerObject(currentPoint, 18);
}

function buildProgressFeature(statusValue, noteValue) {
  return ee.Feature(currentPoint.geometry(), {
    point_id: currentPointId,
    labeler: USER,
    timestamp: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss'),
    status: statusValue,
    notes: noteValue || '',
    queue_index: currentQueueIndex
  });
}

function queueCompletedExport() {
  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
    return;
  }

  if (!currentPoint || currentPointId === null) {
    setStatus('No current point selected. Click "Refresh" first.', 'error');
    return;
  }

  var geom = getSingleDrawnGeometry();
  if (!geom) {
    setStatus('Draw exactly one polygon before submitting.', 'error');
    return;
  }

  var noteValue = notesBox.getValue() || '';

  var polygonFeature = ee.Feature(geom, {
    point_id: currentPointId,
    labeler: USER,
    timestamp: ee.Date(Date.now()).format('YYYY-MM-dd HH:mm:ss'),
    status: 'completed',
    notes: noteValue,
    queue_index: currentQueueIndex
  });

  var polygonCollection = ee.FeatureCollection([polygonFeature]);
  var progressCollection = ee.FeatureCollection([
    buildProgressFeature('completed', noteValue)
  ]);

  var labelAssetId =
    LABELS_USER_FOLDER + '/point_' + currentPointId + '_label';

  var progressAssetId =
    PROGRESS_USER_FOLDER + '/point_' + currentPointId + '_completed';

  Export.table.toAsset({
    collection: polygonCollection,
    description: 'label_point_' + currentPointId,
    assetId: labelAssetId
  });

  Export.table.toAsset({
    collection: progressCollection,
    description: 'progress_point_' + currentPointId + '_completed',
    assetId: progressAssetId
  });

  sessionDoneIds.push(currentPointId);
  sessionCompletedIds.push(currentPointId);
  notesBox.setValue('');
  resetDrawLayer();
  updateSessionLabel();

  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
  } else {
    refreshState();
  }
}

function queueSkippedExport() {
  if (sessionDoneIds.length >= BATCH_LIMIT) {
    setStatus('Batch limit reached (' + BATCH_LIMIT + '). Run tasks, then click "Tasks Completed".', 'error');
    return;
  }

  if (!currentPoint || currentPointId === null) {
    setStatus('No current point selected. Click "Refresh" first.', 'error');
    return;
  }

  var noteValue = notesBox.getValue() || '';
  if (!noteValue.trim()) {
    setStatus('A reason is required in the Notes box to skip a point.', 'error');
    return;
  }

  var progressCollection = ee.FeatureCollection([
    buildProgressFeature('skipped', noteValue)
  ]);

  var progressAssetId =
    PROGRESS_USER_FOLDER + '/point_' + currentPointId + '_skipped';

  Export.table.toAsset({
    collection: progressCollection,
    description: 'progress_point_' + currentPointId + '_skipped',
    assetId: progressAssetId
  });

  sessionDoneIds.push(currentPointId);
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