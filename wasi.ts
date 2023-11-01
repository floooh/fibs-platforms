import { colors, fibs } from './deps.ts';
import WASI from 'https://deno.land/std@0.178.0/wasi/snapshot_preview1.ts';

const SDKVERSION = 20;
const SDKNAME = `wasi-sdk-${SDKVERSION}.0`;
const URLS = {
  'linux': `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${SDKVERSION}/${SDKNAME}-linux.tar.gz`,
  'macos': `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${SDKVERSION}/${SDKNAME}-macos.tar.gz`,
  'windows': `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${SDKVERSION}/${SDKNAME}.m-mingw.tar.gz`,
};

export const project: fibs.ProjectDesc = {
  commands: [
    { name: 'wasisdk', help: cmdHelp, run: cmdRun },
  ],
  runners: [
    { name: 'wasi', run: runnerRun },
  ],
  configs: [
    {
      name: 'wasi',
      ignore: true,
      platform: 'wasi',
      runner: 'wasi',
      compilers: ['clang'],
      toolchainFile: '@sdks:wasisdk/share/cmake/wasi-sdk.cmake',
      cmakeIncludes: [
        '@self:wasi.include.cmake',
      ],
      cmakeVariables: {
        WASI_SDK_PREFIX: '@sdks:wasisdk',
      },
      validate: (project: fibs.Project) => {
        if (!fibs.util.dirExists(dir(project))) {
          return {
            valid: false,
            hints: [
              'WASI SDK not installed (install with \'fibs wasisdk install\')',
            ],
          };
        } else {
          return { valid: true, hints: [] };
        }
      },
    },
    {
      name: 'wasi-make',
      ignore: true,
      inherits: 'wasi',
      generator: 'Unix Makefiles',
    },
    {
      name: 'wasi-make-debug',
      inherits: 'wasi-make',
      buildType: 'debug',
    },
    {
      name: 'wasi-make-release',
      inherits: 'wasi-make',
      buildType: 'release',
    },
    {
      name: 'wasi-ninja',
      ignore: true,
      inherits: 'wasi',
      generator: 'Ninja',
    },
    {
      name: 'wasi-ninja-debug',
      inherits: 'wasi-ninja',
      buildType: 'debug',
    },
    {
      name: 'wasi-ninja-release',
      inherits: 'wasi-ninja',
      buildType: 'release',
    },
  ],
};

function cmdHelp() {
  fibs.log.helpCmd([
    'wasisdk install',
    'wasisdk uninstall',
  ], 'install or uninstall the WASI SDK');
}

async function cmdRun(project: fibs.Project) {
  const args = parseArgs();
  if (args.install) {
    await install(project);
  } else if (args.uninstall) {
    uninstall(project);
  }
}

async function runnerRun(
  project: fibs.Project,
  config: fibs.Config,
  target: fibs.Target,
  options: fibs.RunOptions,
) {
  // can assume here that run() will only be called for executable targets
  const path = `${fibs.util.distDir(project, config)}/${target.name}.wasm`;
  const context = new WASI({
    args: options.args,
    env: Deno.env.toObject(),
  });
  const binary = await Deno.readFile(path);
  const module = await WebAssembly.compile(binary);
  const instance = await WebAssembly.instantiate(module, {
    'wasi_snapshot_preview1': context.exports,
  });
  context.start(instance);
}

function parseArgs(): { install?: boolean; uninstall?: boolean } {
  const args: ReturnType<typeof parseArgs> = {};
  if (Deno.args[1] === undefined) {
    fibs.log.error('expected a subcommand (run \'fibs help wasisdk\')');
  }
  switch (Deno.args[1]) {
    case 'install':
      args.install = true;
      break;
    case 'uninstall':
      args.uninstall = true;
      break;
    default:
      fibs.log.error(
        `unknown subcommand '${Deno.args[1]} (run 'fibs help wasisdk')`,
      );
  }
  return args;
}

function dir(project: fibs.Project): string {
  return `${fibs.util.sdkDir(project)}/wasisdk`;
}

async function install(project: fibs.Project) {
  await download(project);
}

function uninstall(project: fibs.Project) {
  const wasisdkDir = dir(project);
  if (fibs.util.dirExists(wasisdkDir)) {
    if (fibs.log.ask(`Delete directory ${wasisdkDir}?`, false)) {
      fibs.log.info(`deleting ${wasisdkDir}...`);
      Deno.removeSync(wasisdkDir, { recursive: true });
      fibs.log.info(colors.green('done.'));
    } else {
      fibs.log.info('nothing to do.');
    }
  } else {
    fibs.log.warn('WASI SDK not installed, nothing to do.');
  }
}

async function download(project: fibs.Project) {
  if (fibs.util.dirExists(dir(project))) {
    fibs.log.error(
      `WASI SDK already installed, run 'fibs wasisdk uninstall' first`,
    );
  }
  // NOTE: can't use the Deno compress package here because it doesn't preserve file attributes!
  if (!await fibs.util.find('tar', project.tools)!.exists()) {
    fibs.log.error('tar command not found (run \'fibs diag tools\'');
  }
  const sdkDir = `${fibs.util.sdkDir(project)}`;
  const filename = SDKNAME + '.tgz';
  fibs.log.section('downloading WASI SDK');
  const url = URLS[fibs.host.platform()];
  await fibs.util.download({ url, dir: sdkDir, filename });
  fibs.log.info(colors.green('ok       '));
  fibs.log.section('uncompressing WASI SDK');
  await fibs.util.runCmd('tar', {
    args: ['xf', filename],
    cwd: sdkDir,
  });
  Deno.rename(`${sdkDir}/${SDKNAME}`, `${sdkDir}/wasisdk`);
  Deno.removeSync(`${sdkDir}/${filename}`);
  fibs.log.info(colors.green('ok'));
}
