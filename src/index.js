#!/usr/bin/env node

import "dotenv/config";

import chalk from "chalk";
import ora from "ora";
import { program } from "commander";

import { getAssessedReports } from "./ywh.js";
import { runInteractiveList } from "./list.js";

program
  .version("1.0.0")
  .description("Browse YesWeHack reports that triagers have assessed");

program.action(async () => {
  const spinner = ora("Fetching assessed reports from YesWeHack...").start();

  let reports;
  try {
    reports = await getAssessedReports((prog) => {
      spinner.text = `Fetching reports for ${prog.title}...`;
    });
  } catch (err) {
    spinner.fail(chalk.red(`Failed to fetch reports: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  if (reports.length === 0) {
    spinner.info("No assessed reports found.");
    return;
  }

  spinner.succeed(`Found ${reports.length} assessed report(s).`);
  reports.sort((a, b) => (b.cvssScore ?? 0) - (a.cvssScore ?? 0));

  await runInteractiveList(reports);
});

program.parse(process.argv);
