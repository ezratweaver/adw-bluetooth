service_conf = configuration_data()
service_conf.set('libexecdir', join_paths(get_option('prefix'), get_option('libexecdir')))

configure_file(
  input: 'com.ezratweaver.AdwBluetoothDaemon.service.in',
  output: 'com.ezratweaver.AdwBluetoothDaemon.service',
  configuration: service_conf,
  install: true,
  install_dir: join_paths(get_option('sysconfdir'), 'systemd/user')
)

configure_file(
  input: 'com.ezratweaver.AdwBluetoothDaemon.dbus.service.in',
  output: 'com.ezratweaver.AdwBluetoothDaemon.dbus.service',
  configuration: service_conf,
  install: true,
  install_dir: join_paths(get_option('datadir'), 'dbus-1/services')
)

gsettings_schema = 'com.ezratweaver.AdwBluetooth.gschema.xml'

# Compile schemas for development
gnome.compile_schemas(depend_files: gsettings_schema)

# Install GSettings schema
install_data(gsettings_schema,
  install_dir: join_paths(get_option('datadir'), 'glib-2.0/schemas')
)

compile_schemas = find_program('glib-compile-schemas', required: false)
if compile_schemas.found()
  test('Validate schema file',
    compile_schemas,
    args: ['--strict', '--dry-run', meson.current_source_dir()]
  )
endif


# Grab all blueprints/*.blp files
# Crazy idea! If the code is in the repo, it probably needs to get compiled!
c = run_command('bash', '-c', 'ls blueprints/*.blp', check: true)
sources = c.stdout().strip().split('\n')

blueprints = custom_target('blueprints',
  input: sources,
  output: '.',
  command: [find_program('blueprint-compiler'), 'batch-compile', '@OUTPUT@', '@CURRENT_SOURCE_DIR@', '@INPUT@'],
)

desktop_conf = configuration_data()

desktop = configure_file(
  input: 'com.ezratweaver.AdwBluetooth.desktop.in',
  output: 'com.ezratweaver.AdwBluetooth.desktop',
  configuration: desktop_conf,
  install: true,
  install_dir: join_paths(get_option('datadir'), 'applications')
)

# Compile GResources (UI, icons, etc.)
data_res = gnome.compile_resources(
  'com.ezratweaver.AdwBluetooth.data',
  'com.ezratweaver.AdwBluetooth.data.gresource.xml',
  gresource_bundle: true,
  install: true,
  install_dir: pkgdatadir,
  dependencies: blueprints,
)

subdir('icons')
