#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SKILL_NAME = 'laptev-plan';
const LEGACY_SKILL_NAME = 'precision-planning';
const COMMAND_NAMES = ['laptev_plan', 'precision-planning'];
const LEGACY_COMMAND_NAMES = ['laptev-plan'];
const COMMAND_TARGET = '/laptev-plan';
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const BUNDLED_SKILL = path.join(PACKAGE_ROOT, 'skill', 'SKILL.md');

function parseArgs(argv) {
  const result = { command: argv[0] || 'help', home: null };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--home' && argv[i + 1]) {
      result.home = path.resolve(argv[++i]);
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      result.command = 'help';
    } else if (argv[i] === '--version' || argv[i] === '-v') {
      result.command = 'version';
    }
  }
  return result;
}

function hermesHome(explicitHome) {
  if (explicitHome) return explicitHome;
  if (process.env.HERMES_HOME) return path.resolve(process.env.HERMES_HOME);
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'hermes');
  }
  return path.join(os.homedir(), '.hermes');
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function skillPath(home) {
  return path.join(home, 'skills', 'software-development', SKILL_NAME, 'SKILL.md');
}

function addSkillToEnv(content) {
  const wanted = SKILL_NAME;
  const line = /^export HERMES_TUI_SKILLS=(.*)$/m;
  const match = content.match(line);
  if (match) {
    const values = match[1].split(',').map((item) => item.trim()).filter((item) => item && item !== LEGACY_SKILL_NAME);
    if (!values.includes(wanted)) values.unshift(wanted);
    return content.replace(line, `export HERMES_TUI_SKILLS=${values.join(',')}`);
  }
  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
  return `${content}${suffix}\n# Precision Planning preload\nexport HERMES_TUI_SKILLS=${wanted}\n`;
}

function removeSkillFromEnv(content) {
  const line = /^export HERMES_TUI_SKILLS=(.*)$/m;
  const match = content.match(line);
  if (!match) return content;
  const values = match[1].split(',').map((item) => item.trim()).filter(
    (item) => item && item !== SKILL_NAME && item !== LEGACY_SKILL_NAME,
  );
  if (values.length) return content.replace(line, `export HERMES_TUI_SKILLS=${values.join(',')}`);
  return content.replace(/\n?# Precision Planning preload\n/, '\n').replace(`${match[0]}\n`, '');
}

function quickCommandBlock() {
  return [
    'quick_commands:',
    ...COMMAND_NAMES.flatMap((name) => [
      `  ${name}:`,
      '    type: alias',
      `    target: ${COMMAND_TARGET}`,
    ]),
  ].join('\n');
}

function removeQuickCommandBlocks(content, names, targets) {
  const lines = content.split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const name = lines[index].trimEnd();
    const type = lines[index + 1]?.trim();
    const targetLine = lines[index + 2]?.trim();
    const isCommand = names.some((item) => name === `  ${item}:`);
    const isAlias = type === 'type: alias' && targets.some((item) => targetLine === `target: ${item}`);
    if (isCommand && isAlias) {
      index += 2;
      continue;
    }
    output.push(lines[index]);
  }
  return output.join('\n');
}

function updateQuickCommand(content) {
  const header = /^quick_commands:\s*$/m;
  if (!header.test(content)) {
    const prefix = content.length && !content.endsWith('\n') ? '\n' : '';
    return `${content}${prefix}\n# Precision Planning slash command\n${quickCommandBlock()}\n`;
  }

  const headerMatch = header.exec(content);
  const start = headerMatch.index;
  const afterHeader = start + headerMatch[0].length;
  const remainder = content.slice(afterHeader);
  const nextTopLevel = remainder.search(/\n[^\s#][^\n]*:/);
  const end = nextTopLevel >= 0 ? afterHeader + nextTopLevel + 1 : content.length;
  let section = content.slice(start, end);

  section = removeQuickCommandBlocks(
    section,
    LEGACY_COMMAND_NAMES,
    ['/precision-planning', COMMAND_TARGET],
  );

  for (const name of COMMAND_NAMES) {
    const command = new RegExp(`^  ${name}:\\s*$`, 'm');
    if (command.test(section)) {
      const target = new RegExp(`(^  ${name}:\\s*\\n    type:\\s*alias\\s*\\n    target:\\s*).*$`, 'm');
      section = section.replace(target, `$1${COMMAND_TARGET}`);
    } else {
      section = `${section.trimEnd()}\n  ${name}:\n    type: alias\n    target: ${COMMAND_TARGET}\n`;
    }
  }
  return content.slice(0, start) + section + content.slice(end);
}

function removeQuickCommand(content) {
  return removeQuickCommandBlocks(
    content,
    [...COMMAND_NAMES, ...LEGACY_COMMAND_NAMES],
    [COMMAND_TARGET, '/precision-planning'],
  );
}

function setWindowsUserEnv(value) {
  if (process.platform !== 'win32') return;
  const result = spawnSync('setx', ['HERMES_TUI_SKILLS', value], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Не удалось обновить переменную Windows HERMES_TUI_SKILLS: ${result.stderr || result.error}`);
  }
}

function install(home) {
  if (!fs.existsSync(BUNDLED_SKILL)) throw new Error(`Не найден встроенный SKILL.md: ${BUNDLED_SKILL}`);
  const target = skillPath(home);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(BUNDLED_SKILL, target);

  const envFile = path.join(home, '.env');
  const updatedEnv = addSkillToEnv(readText(envFile));
  writeText(envFile, updatedEnv);

  const configFile = path.join(home, 'config.yaml');
  writeText(configFile, updateQuickCommand(readText(configFile)));

  const preloadMatch = updatedEnv.match(/^export HERMES_TUI_SKILLS=(.*)$/m);
  const currentValues = preloadMatch
    ? preloadMatch[1].split(',').map((item) => item.trim()).filter(Boolean)
    : [SKILL_NAME];
  setWindowsUserEnv(currentValues.join(','));

  console.log('Precision Planning v6 установлен.');
  console.log(`Канонический skill-command: /${SKILL_NAME} → ${target}`);
  console.log(`Совместимые aliases: ${COMMAND_NAMES.map((name) => `/${name}`).join(', ')} → ${COMMAND_TARGET}`);
  console.log('Создайте новую сессию Hermes: /new или перезапустите приложение.');
}

function status(home) {
  const target = skillPath(home);
  const config = readText(path.join(home, 'config.yaml'));
  const env = readText(path.join(home, '.env'));
  const aliasesConfigured = COMMAND_NAMES.every(
    (name) => new RegExp(`^  ${name}:\\s*$\\n    type: alias\\s*$\\n    target: ${COMMAND_TARGET.replace('/', '\\/')}\\s*$`, 'm').test(config),
  );
  console.log(`Hermes home: ${home}`);
  console.log(`Skill command: ${fs.existsSync(target) ? 'installed' : 'missing'} (/${SKILL_NAME}: ${target})`);
  console.log(`Slash aliases: ${aliasesConfigured ? 'configured' : 'missing'} (${COMMAND_NAMES.map((name) => `/${name}`).join(', ')})`);
  console.log(`Preload: ${env.includes(`HERMES_TUI_SKILLS=`) && env.includes(SKILL_NAME) ? 'configured' : 'missing'}`);
}

function uninstall(home) {
  const targetDir = path.dirname(skillPath(home));
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  const envFile = path.join(home, '.env');
  if (fs.existsSync(envFile)) writeText(envFile, removeSkillFromEnv(readText(envFile)));
  const configFile = path.join(home, 'config.yaml');
  if (fs.existsSync(configFile)) writeText(configFile, removeQuickCommand(readText(configFile)));
  console.log('Precision Planning удалён из Hermes.');
  console.log('Перезапустите Hermes для обновления списка скиллов.');
}

function help() {
  console.log(`Precision Planning Skill v6 — установщик для Hermes Agent\n\n` +
    `Использование:\n` +
    `  precision-planning install [--home PATH]   установить скилл и /laptev-plan\n` +
    `  precision-planning status [--home PATH]    проверить установку\n` +
    `  precision-planning uninstall [--home PATH] удалить скилл и alias\n` +
    `  precision-planning --version               показать версию пакета\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const home = hermesHome(args.home);
  try {
    if (args.command === 'install') install(home);
    else if (args.command === 'status') status(home);
    else if (args.command === 'uninstall') uninstall(home);
    else if (args.command === 'version') console.log('1.0.3');
    else help();
  } catch (error) {
    console.error(`Ошибка: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
