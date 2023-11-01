import { colors, fibs } from './deps.ts';

const EMSDK_URL = 'https://github.com/emscripten-core/emsdk.git';
const FILE_SERVER_URL = 'https://deno.land/std@0.178.0/http/file_server.ts';

export const project: fibs.ProjectDesc = {
  commands: [
    { name: 'emsdk', help: cmdHelp, run: cmdRun },
  ],
  runners: [
    { name: 'emscripten', run: runnerRun },
  ],
  configs: [
    {
      name: 'emsc',
      ignore: true,
      platform: 'emscripten',
      runner: 'emscripten',
      toolchainFile: '@sdks:emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake',
      cmakeIncludes: [
        '@self:emscripten.include.cmake',
      ],
      compilers: ['clang'],
      validate: (project: fibs.Project) => {
        if (!fibs.util.dirExists(dir(project))) {
          return {
            valid: false,
            hints: [
              'Emscripten SDK not installed (install with \'fibs emsdk install\')',
            ],
          };
        } else {
          return { valid: true, hints: [] };
        }
      },
    },
    {
      name: 'emsc-make',
      ignore: true,
      inherits: 'emsc',
      generator: 'Unix Makefiles',
    },
    {
      name: 'emsc-ninja',
      ignore: true,
      inherits: 'emsc',
      generator: 'Ninja',
    },
    {
      name: 'emsc-vscode',
      ignore: true,
      inherits: 'emsc-ninja',
      opener: 'vscode',
    },
    {
      name: 'emsc-make-debug',
      inherits: 'emsc-make',
      buildType: 'debug',
    },
    {
      name: 'emsc-make-release',
      inherits: 'emsc-make',
      buildType: 'release',
    },
    {
      name: 'emsc-ninja-debug',
      inherits: 'emsc-ninja',
      buildType: 'debug',
    },
    {
      name: 'emsc-ninja-release',
      inherits: 'emsc-ninja',
      buildType: 'release',
    },
    {
      name: 'emsc-vscode-debug',
      inherits: 'emsc-vscode',
      buildType: 'debug',
    },
    {
      name: 'emsc-vscode-release',
      inherits: 'emsc-vscode',
      buildType: 'release',
    },
  ],
};

function cmdHelp() {
  fibs.log.helpCmd([
    'emsdk install [version=latest]',
    'emsdk list',
    'emsdk uninstall',
  ], 'install and maintain the Emscripten SDK');
}

async function cmdRun(project: fibs.Project) {
  const args = parseArgs();
  if (args.install && args.version) {
    await install(project, args.version);
  } else if (args.list) {
    await list(project);
  } else if (args.uninstall) {
    uninstall(project);
  }
}

async function runnerRun(
  project: fibs.Project,
  config: fibs.Config,
  target: fibs.Target,
  _options: fibs.RunOptions,
) {
  // can assume here that run() will only be called for executable targets
  const url = `http://localhost:8080/${target.name}.html`;
  switch (fibs.host.platform()) {
    case 'macos':
      await fibs.util.runCmd('open', { args: [url] });
      break;
    case 'linux':
      await fibs.util.runCmd('xdg-open', { args: [url] });
      break;
    case 'windows':
      await fibs.util.runCmd('cmd', { args: ['/c', 'start', url] });
      break;
  }
  await serve({ target: fibs.util.distDir(project, config), port: '8080' });
}

function parseArgs(): {
  install?: boolean;
  list?: boolean;
  uninstall?: boolean;
  version?: string;
} {
  const args: ReturnType<typeof parseArgs> = {};
  if (Deno.args[1] === undefined) {
    fibs.log.error('expected a subcommand (run \'fibs help emsdk\')');
  }
  switch (Deno.args[1]) {
    case 'install':
      args.install = true;
      args.version = Deno.args[2];
      if (args.version === undefined) {
        args.version = 'latest';
      }
      break;
    case 'list':
      args.list = true;
      break;
    case 'uninstall':
      args.uninstall = true;
      break;
    default:
      fibs.log.error(
        `unknown subcommand '${Deno.args[1]} (run 'fibs help emsdk')`,
      );
  }
  return args;
}

function dir(project: fibs.Project): string {
  return `${fibs.util.sdkDir(project)}/emsdk`;
}

function toolPath(project: fibs.Project): string {
  return `${dir(project)}/emsdk`;
}

async function emsdk(project: fibs.Project, args: string[]): Promise<number> {
  const cmd = toolPath(project);
  if (!fibs.util.fileExists(cmd)) {
    fibs.log.error(
      `emsdk tool not found at ${toolPath}, run 'fibs emsdk install`,
    );
  }
  const res = await fibs.util.runCmd(cmd, {
    args,
    cwd: dir(project),
    winUseCmd: true,
  });
  return res.exitCode;
}

async function install(project: fibs.Project, version: string) {
  await cloneOrUpdateEmsdk(project);
  await emsdk(project, [
    'install',
    '--shallow',
    '--disable-assertions',
    version,
  ]);
  await activate(project, version);
}

async function activate(project: fibs.Project, version: string) {
  fibs.log.section(`activing emsdk version '${version}'`);
  await emsdk(project, ['activate', '--embedded', version]);
}

async function cloneOrUpdateEmsdk(project: fibs.Project) {
  const sdkRoot = fibs.util.ensureSdkDir(project);
  const emsdkDir = dir(project);
  if (fibs.util.dirExists(emsdkDir)) {
    fibs.log.section(`updating emsdk in ${emsdkDir}`);
    await fibs.git.update({ dir: emsdkDir, url: EMSDK_URL, force: true });
  } else {
    fibs.log.section(`cloning emsdk to ${emsdkDir} `);
    await fibs.git.clone({ url: EMSDK_URL, dir: sdkRoot });
  }
}

async function list(project: fibs.Project) {
  await emsdk(project, ['list']);
}

function uninstall(project: fibs.Project) {
  const emsdkDir = dir(project);
  if (fibs.util.dirExists(emsdkDir)) {
    if (fibs.log.ask(`Delete directory ${emsdkDir}?`, false)) {
      fibs.log.info(`deleting ${emsdkDir}...`);
      Deno.removeSync(emsdkDir, { recursive: true });
      fibs.log.info(colors.green('done.'));
    } else {
      fibs.log.info('nothing to do.');
    }
  } else {
    fibs.log.warn('Emscripten SDK not installed, nothing to do.');
  }
}

// http server helper function
async function serve(
  options: {
    port?: string;
    cors?: boolean;
    dirListing?: boolean;
    dotfiles?: boolean;
    host?: string;
    cert?: string;
    key?: string;
    target?: string;
    headers?: string[];
  },
) {
  const {
    target = '.',
    host = 'localhost',
    port = '4507',
    cors = true,
    cert,
    key,
    dotfiles = true,
    headers = ['Cache-Control: no-cache'],
  } = options;

  const args: string[] = [
    'run',
    '--no-check',
    '--allow-read',
    '--allow-net',
    FILE_SERVER_URL,
    target,
    '--host',
    host,
    '-p',
    `${port}`,
    '-v',
    `${cors ? '--cors' : ''}`,
    `${dotfiles ? '' : '--no-dotfiles'}`,
    `${cert ? '--cert' : ''}`,
    `${cert ? cert : ''}`,
    `${key ? '--key' : ''}`,
    `${key ? key : ''}`,
    ...headers.map((header) => `-H=${header}`),
  ];
  await fibs.util.runCmd(Deno.execPath(), { args });
}
