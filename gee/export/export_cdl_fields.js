/***************************************
 * EXPORT: CDL FIELD POLYGONS AND THE PROMOTION OUTPUTS
 *
 * Pulls the three CDL-derived assets out of Earth Engine so promotion can be
 * redone locally with per-label provenance attached (Script 9).
 *
 * Unlike the label backup, nothing here is irreplaceable. All three are
 * deterministic outputs of the vendored scripts and can be rebuilt from
 * published data at any time, so they are gitignored rather than committed.
 * They are exported because Script 9 needs them as inputs, not as a backup.
 *
 * What comes out:
 *
 *   cdl_fields_md_2022            Every CDL field polygon in Maryland. The big
 *                                 one. Script 9 promotes hand-drawn labels onto
 *                                 these.
 *
 *   cdl_fields_positive_md_2022   The positives Earth Engine produced. Not an
 *                                 input — a check. Redoing promotion locally
 *                                 and comparing against this is what shows the
 *                                 local reimplementation is trustworthy.
 *
 *   cdl_fields_excluded_md_2022   Every field a hand-drawn label touches at
 *                                 all, including slivers below the promotion
 *                                 threshold. Counting this answers A-10, whose
 *                                 stated test is "count them. One query."
 *
 * Three export tasks. The first is large and will take a while.
 ***************************************/

// ---------------------------
// CONFIG
// ---------------------------
var BASE = 'projects/irrigation-mapping-agwa/assets/';
var DRIVE_FOLDER = 'agwa_ee_backup';   // same folder as the label backup

var TARGETS = [
  {
    name: 'cdl_fields_md_2022',
    id: BASE + 'cdl_fields_md_2022',
    note: 'All Maryland CDL fields. Large — expect tens of thousands of polygons.'
  },
  {
    name: 'cdl_fields_positive_md_2022',
    id: BASE + 'cdl_fields_positive_md_2022',
    note: 'EE-produced positives. Used to validate the local redo.'
  },
  {
    name: 'cdl_fields_excluded_md_2022',
    id: BASE + 'cdl_fields_excluded_md_2022',
    note: 'Every field touched by a label, slivers included. Answers A-10.'
  }
];

// ---------------------------
// REPORT SIZES BEFORE EXPORTING
// ---------------------------
// Worth knowing what you are about to wait for, and the counts are the first
// half of the measurement Script 9 produces anyway.
print('================================================');
print('CDL ASSET EXPORT');
print('================================================');

TARGETS.forEach(function(t) {
  var fc = ee.FeatureCollection(t.id);
  print('--- ' + t.name + ' ---');
  print(t.note);
  print('features:', fc.size());
});

// Property names on the main collection, so Script 9 knows what it is reading.
print('Properties carried by cdl_fields_md_2022:',
  ee.FeatureCollection(TARGETS[0].id).first().propertyNames());

// ---------------------------
// EXPORTS
// ---------------------------
// GeoJSON keeps geometry exactly and reads straight into geopandas.
TARGETS.forEach(function(t) {
  Export.table.toDrive({
    collection: ee.FeatureCollection(t.id),
    description: 'export_' + t.name,
    folder: DRIVE_FOLDER,
    fileNamePrefix: t.name,
    fileFormat: 'GeoJSON'
  });
});

print('Three exports queued. Open the Tasks tab and run each one.');
print('cdl_fields_md_2022 is the slow one — minutes, not seconds.');
print('Files land in Drive folder: ' + DRIVE_FOLDER);
