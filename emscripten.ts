//------------------------------------------------------------------------------
//  Import options:
//
//  emscriptenShellFile: string (default: @self:shell.html)
//
import { colors, fibs } from './deps.ts';

const EMSDK_URL = 'https://github.com/emscripten-core/emsdk.git';

export function configure(c: fibs.Configurer) {
    c.addCommand({ name: 'emsdk', help: cmdHelp, run: cmdRun });
    c.addRunner({ name: 'emscripten', run: runnerRun });
    addConfigs(c);
}

export function build(b: fibs.Builder) {
    if (b.activeConfig().platform === 'emscripten') {
        b.addCmakeInclude('emscripten.include.cmake');
        const shellFile = b.importOption('emscriptenShellFile') ?? `${b.selfDir()}/shell.html`;
        b.addLinkOptions([`--shell-file ${shellFile}`]);
    }
}

function addConfigs(c: fibs.Configurer) {
    const baseConfig: fibs.ConfigDesc = {
        name: 'emsc',
        platform: 'emscripten',
        runner: 'emscripten',
        compilers: ['clang'],
        buildMode: 'debug',
        toolchainFile: `${c.sdkDir()}/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake`,
        validate: (project: fibs.Project) => {
            if (!fibs.util.dirExists(emsdkDir(project))) {
                return {
                    valid: false,
                    hints: [`Emscripten SDK not installed (run 'fibs emsdk install')`],
                };
            } else {
                return { valid: true, hints: [] };
            }
        },
    };
    c.addConfig({ ...baseConfig, name: 'emsc-make-debug', generator: 'make', buildMode: 'debug' });
    c.addConfig({ ...baseConfig, name: 'emsc-make-release', generator: 'make', buildMode: 'release' });
    c.addConfig({ ...baseConfig, name: 'emsc-ninja-debug', generator: 'ninja', buildMode: 'debug' });
    c.addConfig({ ...baseConfig, name: 'emsc-ninja-release', generator: 'ninja', buildMode: 'release' });
    c.addConfig({ ...baseConfig, name: 'emsc-vscAde-debug', generator: 'ninja', buildMode: 'debug', opener: 'vscode' });
    c.addConfig({
        ...baseConfig,
        name: 'emsc-vscode-release',
        generator: 'ninja',
        buildMode: 'release',
        opener: 'vscode',
    });
}

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
    const emrunPath = `${project.sdkDir()}/emsdk/upstream/emscripten/emrun`;
    const cwd = `${project.distDir(config.name)}`;
    await fibs.util.runCmd(emrunPath, {
        cwd,
        args: ['--browser', 'chrome', `${target.name}.html`],
    });
}

function parseArgs(): {
    install?: boolean;
    list?: boolean;
    uninstall?: boolean;
    version?: string;
} {
    const args: ReturnType<typeof parseArgs> = {};
    if (Deno.args[1] === undefined) {
        fibs.log.panic("expected a subcommand (run 'fibs help emsdk')");
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
            fibs.log.panic(
                `unknown subcommand '${Deno.args[1]} (run 'fibs help emsdk')`,
            );
    }
    return args;
}

function emsdkDir(project: fibs.Project): string {
    return `${project.sdkDir()}/emsdk`;
}

async function emsdk(project: fibs.Project, args: string[]): Promise<number> {
    const cmd = `${emsdkDir(project)}/emsdk`;
    if (!fibs.util.fileExists(cmd)) {
        fibs.log.panic(
            `emsdk tool not found at ${cmd}, run 'fibs emsdk install`,
        );
    }
    const res = await fibs.util.runCmd(cmd, {
        args,
        cwd: emsdkDir(project),
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
    const dir = emsdkDir(project);
    if (fibs.util.dirExists(dir)) {
        fibs.log.section(`updating emsdk in ${dir}`);
        await fibs.git.update({ dir, url: EMSDK_URL, force: true });
    } else {
        fibs.log.section(`cloning emsdk to ${dir} `);
        await fibs.git.clone({ url: EMSDK_URL, dir: sdkRoot });
    }
}

async function list(project: fibs.Project) {
    await emsdk(project, ['list']);
}

function uninstall(project: fibs.Project) {
    const dir = emsdkDir(project);
    if (fibs.util.dirExists(dir)) {
        if (fibs.log.ask(`Delete directory ${dir}?`, false)) {
            fibs.log.info(`deleting ${dir}...`);
            Deno.removeSync(dir, { recursive: true });
            fibs.log.info(colors.green('done.'));
        } else {
            fibs.log.info('nothing to do.');
        }
    } else {
        fibs.log.warn('Emscripten SDK not installed, nothing to do.');
    }
}
