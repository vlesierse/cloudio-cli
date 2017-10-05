#!/usr/bin/env node
const program = require('commander')
const commands = require('./src/commands')
const packageJson = require('./package.json')
let stdin = ''

// Configure program with commands
commands(program);

program
    .version(packageJson.version)
    .usage('<command> [options]')
    .parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}