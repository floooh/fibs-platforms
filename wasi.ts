import { colors, fibs } from './deps.ts';

const SDKVERSION = 29;

function getSdkName(): string {
  return `wasi-sdk-${SDKVERSION}.0-${fibs.host.arch()}-${fibs.host.platform()}`;
}

function getUrl(): string {
  return `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${SDKVERSION}/${getSdkName()}.tar.gz`;
}

export function configure(c: fibs.Configurer): void {
  c.addCommand({ name: 'wasisdk', help: cmdHelp, run: cmdRun });
  c.addRunner({ name: 'wasi', run: runnerRun });
  c.addTool(tarTool);
  c.addTool(wasmtimeTool);
  configs.forEach((config) => c.addConfig(config));
}

// register tar as optional tool
const tarTool: fibs.ToolDesc = {
    name: 'tar',
    platforms: ['windows', 'macos', 'linux'],
    optional: true,
    notFoundMsg: 'required for unpacking downloaed sdk archives',
    exists: async(): Promise<boolean> => {
      try {
        await fibs.util.runCmd('tar', { args: ['--version'], stdout: 'piped', showCmd: false, abortOnError: false });
        return true;
      } catch (err) {
        return false;
      }
    }
};

// register wasmtime as tool, since the Deno WASI support seems to have regressed
const wasmtimeTool: fibs.ToolDesc = {
  name: 'wasmtime',
  platforms: ['windows', 'linux', 'macos'],
  optional: true,
  notFoundMsg: 'required for running wasi executables',
  exists: async(): Promise<boolean > => {
    try {
      await fibs.util.runCmd('wasmtime', { args: ['--version'], stdout: 'piped', showCmd: false, abortOnError: false });
      return true;
    } catch (err) {
      return false;
    }
  }
}

// setup WASI build configs
const baseConfig: fibs.ConfigDesc = {
  name: 'wasi',
  platform: 'wasi',
  runner: 'wasi',
  compilers: ['clang'],
  toolchainFile: '@sdks:wasisdk/share/cmake/wasi-sdk.cmake',
  buildMode: 'debug',
  cmakeIncludes: [
    '@self:wasi.include.cmake',
  ],
  cmakeVariables: {
    WASI_SDK_PREFIX: '@sdks:wasisdk',
  },
  validate: (project: fibs.Project) => {
    if (!fibs.util.dirExists(`${dir(project)}`)) {
      return {
        valid: false,
        hints: [ `WASI SDK not installed (run 'fibs wasisdk install')`],
      }
    } else {
      return { valid: true, hints: [] };
    }
  }
};

const configs: fibs.ConfigDesc[] = [
  { ...baseConfig, name: 'wasi-make-debug', generator: 'make', buildMode: 'debug' },
  { ...baseConfig, name: 'wasi-make-release', generator: 'make', buildMode: 'release' },
  { ...baseConfig, name: 'wasi-ninja-debug', generator: 'ninja', buildMode: 'debug' },
  { ...baseConfig, name: 'wasi-ninja-release', generator: 'ninja', buildMode: 'release' },
];

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
  const path = `${project.distDir()}/${target.name}.wasm`;
  options = { ...options, args:[ path,  ...options.args]};
  await fibs.util.runCmd('wasmtime', options);
}

function parseArgs(): { install?: boolean; uninstall?: boolean } {
  const args: ReturnType<typeof parseArgs> = {};
  if (Deno.args[1] === undefined) {
    fibs.log.panic('expected a subcommand (run \'fibs help wasisdk\')');
  }
  switch (Deno.args[1]) {
    case 'install':
      args.install = true;
      break;
    case 'uninstall':
      args.uninstall = true;
      break;
    default:
      fibs.log.panic(
        `unknown subcommand '${Deno.args[1]} (run 'fibs help wasisdk')`,
      );
  }
  return args;
}

function dir(project: fibs.Project): string {
  return `${project.sdkDir()}/wasisdk`;
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
    fibs.log.panic(
      `WASI SDK already installed, run 'fibs wasisdk uninstall' first`,
    );
  }
  // NOTE: can't use the Deno compress package here because it doesn't preserve file attributes!
  if (!(await project.tool('tar').exists())) {
    fibs.log.panic('tar command not found (run \'fibs diag tools\'');
  }
  const sdkDir = project.sdkDir();
  const filename = getSdkName() + '.tgz';
  fibs.log.section('downloading WASI SDK');
  const url = getUrl();
  await fibs.util.download({ url, dir: sdkDir, filename });
  fibs.log.info(colors.green('ok       '));
  fibs.log.section('uncompressing WASI SDK');
  await fibs.util.runCmd('tar', {
    args: ['xf', filename],
    cwd: sdkDir,
  });
  Deno.rename(`${sdkDir}/${getSdkName()}`, `${sdkDir}/wasisdk`);
  Deno.removeSync(`${sdkDir}/${filename}`);
  fibs.log.info(colors.green('ok'));
}
