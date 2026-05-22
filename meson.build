project('adw-bluetooth',
          version: '1.1.0',
    meson_version: '>= 0.62.0',
  default_options: [ 'warning_level=2', 'werror=false', ],
)

gnome = import('gnome')

pkgdatadir = join_paths(get_option('datadir'), meson.project_name())

gjs_dep = dependency('gjs-1.0', version: '>= 1.54.0')
gjs_console = gjs_dep.get_variable(pkgconfig: 'gjs_console')

tsc = find_program('tsc', required: true)

subdir('data')
subdir('gui')

if get_option('build_daemon')
  go = find_program('go', required: true)
  daemon = custom_target('daemon',
    input: run_command(
      'bash', '-c', 'find daemon -name "*.go" | sort',
      check: true,
    ).stdout().strip().split('\n'),
    output: 'adw-bluetooth-daemon',
    command: [go, 'build', '-C', meson.project_source_root() / 'daemon', '-o', meson.project_build_root() / 'adw-bluetooth-daemon', '.'],
    install: true,
    install_dir: get_option('libexecdir'),
    build_by_default: true,
  )
endif

gnome.post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: false, # Enable if we start shipping with icons
  update_desktop_database: true,
)