# Maintainer: Ezra Weaver <ezratweaver@gmail.com>
pkgname=adw-bluetooth
pkgver=1.0.0
pkgrel=1
pkgdesc='GNOME Inspired LibAdwaita Bluetooth Applet'
url="https://github.com/ezratweaver/adw-bluetooth/"
arch=('x86_64')
license=(GPL-3.0)
depends=(
  bluez
  dconf
  gjs
  glib2
  gtk4
  hicolor-icon-theme
  libadwaita
)
makedepends=(
  blueprint-compiler
  git
  go
  meson
  typescript
)
source=(
  "git+https://github.com/ezratweaver/${pkgname}"
)
b2sums=('SKIP')

build() {
  cd "${pkgname}-${pkgver}"
  arch-meson . build
  meson compile -C build
}

package() {
  cd "${pkgname}-${pkgver}"
  meson install -C build --destdir "$pkgdir"
}