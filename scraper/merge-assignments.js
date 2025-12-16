/**
 * Merge manual assignment data into grades.json
 *
 * Usage:
 *   node scraper/merge-assignments.js
 *
 * Reads: scraper/manual-assignments.json
 * Updates: src/data/grades.json
 */

const fs = require('fs').promises;
const path = require('path');

async function mergeAssignments() {
  console.log('Reading manual assignments data...');

  const manualPath = path.join(__dirname, 'manual-assignments.json');
  const gradesPath = path.join(__dirname, '..', 'src', 'data', 'grades.json');

  // Read both files
  const manualData = JSON.parse(await fs.readFile(manualPath, 'utf-8'));
  const gradesData = JSON.parse(await fs.readFile(gradesPath, 'utf-8'));

  console.log(`Found ${manualData.classes.length} classes in manual data`);
  console.log(`Found ${gradesData.classes.length} classes in grades.json`);

  // Create a map of class names to assignment arrays
  const assignmentMap = new Map();

  for (const classData of manualData.classes) {
    assignmentMap.set(classData.class_name, classData.assignments);
  }

  // Merge assignments into grades.json
  let updatedCount = 0;

  for (const gradeClass of gradesData.classes) {
    const assignments = assignmentMap.get(gradeClass.class_name);

    if (assignments) {
      // Convert assignments to match the expected format
      gradeClass.assignments = assignments.map(a => ({
        id: `${gradeClass.class_name}_${a.name}`.replace(/\s/g, '_'),
        name: a.name,
        category: a.category,
        dueDate: a.due_date,
        score: a.score,
        maxPoints: a.max_points,
        percentage: a.percentage,
        status: a.status
      }));

      updatedCount++;
      console.log(`✓ Added ${assignments.length} assignments to ${gradeClass.class_name}`);
    } else {
      console.log(`  No assignment data for ${gradeClass.class_name}`);
    }
  }

  // Write updated grades.json
  await fs.writeFile(
    gradesPath,
    JSON.stringify(gradesData, null, 2),
    'utf-8'
  );

  console.log(`\n✓ Updated ${updatedCount} classes in grades.json`);
  console.log(`✓ Saved to: ${gradesPath}`);

  // Calculate total assignments
  const totalAssignments = gradesData.classes.reduce(
    (sum, c) => sum + (c.assignments?.length || 0),
    0
  );
  console.log(`\nTotal assignments now in grades.json: ${totalAssignments}`);
}

mergeAssignments().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
