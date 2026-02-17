gnome = import('gnome')

# Grab all .ts files recursively
# Crazy idea! If the code is in the repo, it probably needs to get compiled!
c = run_command('bash', '-c', 'find . -name "*.ts" | sort', check: true)
sources = files(c.stdout().strip().split('\n'))

tsc_out = meson.project_build_root() / 'tsc-out'

typescript = custom_target(
  'typescript-compile',
  input: sources,
  build_by_default: true,
  build_always_stale: true,
  command: [ tsc, '--outDir', tsc_out ],
  output: ['tsc-output'],
)

src_res = gnome.compile_resources(
  'com.ezratweaver.AdwBluetooth.src',
  'com.ezratweaver.AdwBluetooth.src.gresource.xml',
  dependencies: typescript,
  source_dir: tsc_out,
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
)

bin_conf = configuration_data()
bin_conf.set('GJS', gjs_console)
bin_conf.set('PACKAGE_VERSION', meson.project_version())
bin_conf.set('PACKAGE_NAME', meson.project_name())
bin_conf.set('prefix', get_option('prefix'))
bin_conf.set('libdir', join_paths(get_option('prefix'), get_option('libdir')))
bin_conf.set('datadir', join_paths(get_option('prefix'), get_option('datadir')))
bin_conf.set('resource_path', '/com/ezratweaver/AdwBluetooth')

app_launcher = configure_file(
  input: 'com.ezratweaver.AdwBluetooth.in',
  output: 'adw-bluetooth',
  configuration: bin_conf,
  install: true,
  install_dir: get_option('bindir')
)

run_target(
  'devel',
  command: [gjs_console, '-m', app_launcher],
  depends: [src_res, data_res],
)