<?php
/**
 * Plugin Name:       BMS Block Extractor
 * Description:       Exports one block instance exactly as it renders — outer HTML, every CSS rule that actually matches it (media queries and all), computed styles at three breakpoints, its attribute JSON and its assets — as a zip bundle or a clipboard paste. Built to rebuild Kadence blocks in another stack.
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            BMS
 * License:           GPL-2.0-or-later
 *
 * Read-only against your site: it never writes an option, setting or post.
 * The only thing it writes is the export bundle, into uploads/bms-block-extractor/.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BMS_BE_VERSION', '1.0.0' );
define( 'BMS_BE_FILE', __FILE__ );
define( 'BMS_BE_DIR', plugin_dir_path( __FILE__ ) );
define( 'BMS_BE_URL', plugin_dir_url( __FILE__ ) );

/** Capability required for every screen, route and capture in this plugin. */
function bms_be_cap() {
	return 'edit_posts';
}

/**
 * Bare origin of the front end — scheme://host[:port], no path.
 * postMessage compares origins, so home_url() is wrong here on subdirectory installs.
 */
function bms_be_origin() {
	$parts = wp_parse_url( home_url() );
	if ( empty( $parts['host'] ) ) {
		return home_url();
	}
	$origin = ( isset( $parts['scheme'] ) ? $parts['scheme'] : 'https' ) . '://' . $parts['host'];
	if ( ! empty( $parts['port'] ) ) {
		$origin .= ':' . $parts['port'];
	}
	return $origin;
}

require_once BMS_BE_DIR . 'includes/class-bms-be-capture.php';
require_once BMS_BE_DIR . 'includes/class-bms-be-bundle.php';
require_once BMS_BE_DIR . 'includes/class-bms-be-rest.php';
require_once BMS_BE_DIR . 'includes/class-bms-be-admin.php';

add_action( 'plugins_loaded', function () {
	BMS_BE_Capture::init();
	BMS_BE_Rest::init();
	BMS_BE_Admin::init();
} );
