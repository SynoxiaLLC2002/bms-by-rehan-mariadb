<?php
/**
 * Front-end capture mode.
 *
 * When a page is loaded with ?bms_capture=1 plus a valid nonce, every block that
 * renders gets a data-bms-uid attribute on its outermost tag, and a uid -> block
 * map (name + attributes) is printed in the footer. capture.js then walks the real
 * DOM, with the real cascade applied, and reports back to the admin screen.
 *
 * Tagging happens on `render_block` rather than `render_block_data` because
 * render_block_data only fires for top-level blocks — render_block fires for every
 * block, inner ones included. It fires in post-order (children first); that is
 * fine, the uids are opaque and the tree is rebuilt from DOM nesting.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BMS_BE_Capture {

	/** @var array<string,array> uid => name/attrs */
	private static $map = array();

	/** @var int */
	private static $counter = 0;

	/** @var bool */
	private static $active = false;

	public static function init() {
		add_action( 'wp', array( __CLASS__, 'maybe_activate' ) );
	}

	/** The URL the admin screen loads in its preview iframe. */
	public static function capture_url( $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post ) {
			return '';
		}

		$link = ( 'publish' === $post->post_status )
			? get_permalink( $post )
			: get_preview_post_link( $post );

		if ( ! $link ) {
			return '';
		}

		return add_query_arg(
			array(
				'bms_capture' => 1,
				'bms_nonce'   => wp_create_nonce( 'bms_be_capture' ),
			),
			$link
		);
	}

	public static function maybe_activate() {
		if ( is_admin() || empty( $_GET['bms_capture'] ) ) {
			return;
		}
		if ( ! current_user_can( bms_be_cap() ) ) {
			return;
		}
		$nonce = isset( $_GET['bms_nonce'] ) ? sanitize_text_field( wp_unslash( $_GET['bms_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'bms_be_capture' ) ) {
			return;
		}

		self::$active = true;

		// Late priority so other filters have finished rewriting the markup first.
		add_filter( 'render_block', array( __CLASS__, 'tag_block' ), 9999, 2 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 99 );
		add_action( 'wp_footer', array( __CLASS__, 'print_map' ), PHP_INT_MAX );
		add_filter( 'show_admin_bar', '__return_false' );
	}

	/**
	 * Stamp the block's outermost element. Blocks whose output has no HTML tag
	 * (bare text, comments) are recorded as untaggable rather than wrapped —
	 * injecting a wrapper would change flex/grid child counts and skew the capture.
	 */
	public static function tag_block( $content, $block ) {
		if ( empty( $block['blockName'] ) || '' === trim( (string) $content ) ) {
			return $content;
		}

		$uid = 'bms' . ( ++self::$counter );

		$entry = array(
			'uid'      => $uid,
			'name'     => $block['blockName'],
			'attrs'    => isset( $block['attrs'] ) ? $block['attrs'] : array(),
			'untagged' => false,
		);

		if ( ! class_exists( 'WP_HTML_Tag_Processor' ) ) {
			$entry['untagged'] = true;
			self::$map[ $uid ] = $entry;
			return $content;
		}

		$processor = new WP_HTML_Tag_Processor( $content );
		if ( ! $processor->next_tag() ) {
			$entry['untagged'] = true;
			self::$map[ $uid ] = $entry;
			return $content;
		}

		$processor->set_attribute( 'data-bms-uid', $uid );
		self::$map[ $uid ] = $entry;

		return $processor->get_updated_html();
	}

	public static function enqueue() {
		wp_enqueue_script(
			'bms-be-capture',
			BMS_BE_URL . 'assets/capture.js',
			array(),
			BMS_BE_VERSION,
			true
		);
	}

	/**
	 * Printed at PHP_INT_MAX on wp_footer so every block — including ones inside
	 * footer template parts — is already in the map. capture.js reads it lazily,
	 * so it does not matter that this lands after the script tag itself.
	 */
	public static function print_map() {
		if ( ! self::$active ) {
			return;
		}
		printf(
			'<script id="bms-be-map">window.BMS_BE_MAP=%s;window.BMS_BE_PAGE=%s;</script>',
			wp_json_encode( self::$map ),
			wp_json_encode(
				array(
					'url'   => home_url( add_query_arg( array() ) ),
					'title' => wp_get_document_title(),
					'id'    => get_queried_object_id(),
				)
			)
		);
	}
}
