#!/usr/bin/env node

import "./env.js";

import chalk from "chalk";
import ora from "ora";
import figlet from "figlet";
import inquirer from "inquirer";
import { program } from "commander";

import { getAssessedReports } from "./ywh.js";
import { runInteractiveList } from "./tui/list.js";
import { loadConfig, saveConfig } from "./config.js";

function formatAge(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

function printTitle() {
  const cols = process.stdout.columns || 80;
  if (cols < 65) return;
  console.log(chalk.cyan(figlet.textSync("YWH Tracker", { font: "Slant" })));
}

program
  .version("1.0.0")
  .description("Browse YesWeHack reports that triagers have assessed")
  .option("-r, --refresh", "ignore any cached data and do a full refetch")
  .option("--no-cache", "don't read or write the on-disk cache");

async function promptScope() {
  const { scope } = await inquirer.prompt([
    {
      type: "select",
      name: "scope",
      message: "Which reports do you want to see?",
      choices: [
        { name: "All reports", value: "all" },
        { name: "Only my reports", value: "mine" },
      ],
    },
  ]);

  if (scope !== "mine") return null;

  const config = loadConfig();
  if (config.ywhUsername) return config.ywhUsername;

  const { username } = await inquirer.prompt([
    {
      type: "input",
      name: "username",
      message: "Enter your YesWeHack username:",
      validate: (value) => (value.trim() ? true : "Username cannot be empty."),
    },
  ]);

  saveConfig({ ...config, ywhUsername: username.trim() });
  return username.trim();
}

program.action(async (options) => {
  printTitle();

  const username = await promptScope();

  const spinner = ora("Fetching reports from YesWeHack...").start();

  let reports;
  let source;
  let fetchedAt;
  try {
    ({ reports, source, fetchedAt } = await getAssessedReports(
      (prog) => {
        spinner.text = `Fetching reports for ${prog.title}...`;
      },
      { refresh: Boolean(options.refresh), cache: options.cache !== false }
    ));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to fetch reports: ${err.message}`));
    process.exitCode = 1;
    return;
  }

  if (username) {
    reports = reports.filter((r) =>
      r.assignees.some((a) => a.toLowerCase() === username.toLowerCase())
    );
  }

  const sourceNote =
    source === "cache"
      ? ` (cached ${formatAge(Date.now() - fetchedAt)} ago — use --refresh to update)`
      : "";

  if (reports.length === 0) {
    spinner.info(`No reports found.${sourceNote}`);
    return;
  }

  spinner.succeed(`Found ${reports.length} report(s).${sourceNote}`);
  await runInteractiveList(reports);
});

program.parse(process.argv);
