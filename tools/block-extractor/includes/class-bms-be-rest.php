<?php
/**
 * REST endpoint the admin screen posts the captured payload to.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BMS_BE_Rest {

	const NS = 'bms-block-extractor/v1';

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function routes() {
		register_rest_route(
			self::NS,
			'/bundle',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'save_bundle' ),
				'permission_callback' => static function () {
					return current_user_can( bms_be_cap() );
				},
			)
		);
	}

	public static function save_bundle( WP_REST_Request $request ) {
		$payload = $request->get_json_params();

		if ( ! is_array( $payload ) || empty( $payload['block']['name'] ) ) {
			return new WP_Error( 'bms_be_payload', 'Malformed capture payload.', array( 'status' => 400 ) );
		}

		foreach ( array( 'markup', 'css', 'assets', 'scripts', 'breakpoints' ) as $key ) {
			if ( ! isset( $payload[ $key ] ) ) {
				return new WP_Error( 'bms_be_payload', 'Capture payload is missing ' . $key . '.', array( 'status' => 400 ) );
			}
		}

		$result = BMS_BE_Bundle::write( $payload );

		if ( is_wp_error( $result ) ) {
			$result->add_data( array( 'status' => 500 ) );
			return $result;
		}

		unset( $result['dir'] ); // no filesystem paths over the wire

		return rest_ensure_response( $result );
	}
}
