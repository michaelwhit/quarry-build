/**
 * A made-up caseload file for trying the import. It is shaped like a typical caseload export:
 * a report title above the header, extra columns the import ignores, and "Last, First" names.
 * Every name here is invented.
 */
export const EXAMPLE_FILE_NAME = "example-caseload.csv";

export const EXAMPLE_FILE = [
  "Caseload report (made-up example)",
  "",
  "Student Name,Grade Level,Case Manager,Primary Service,Minutes per Week",
  '"Examplewood, Avery",3,Sample Teacher,Special education,120',
  '"Samplefield, Blake",K,Sample Teacher,Speech-language,60',
  '"Teststone, Casey",5,Sample Teacher,Special education,150',
  '"Mockridge, Devon",Seventh,Sample Teacher,Occupational therapy,30',
  "",
].join("\n");
