<?php
/**
 * Tools -> Block Extractor, plus the editor toolbar assets.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BMS_BE_Admin {

	const SLUG = 'bms-block-extractor';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_action( 'enqueue_block_editor_assets', array( __CLASS__, 'enqueue_editor' ) );
	}

	public static function admin_url() {
		return admin_url( 'tools.php?page=' . self::SLUG );
	}

	public static function menu() {
		add_management_page(
			'Block Extractor',
			'Block Extractor',
			bms_be_cap(),
			self::SLUG,
			array( __CLASS__, 'render' )
		);
	}

	public static function enqueue( $hook ) {
		if ( 'tools_page_' . self::SLUG !== $hook ) {
			return;
		}

		wp_enqueue_style( 'bms-be-admin', BMS_BE_URL . 'assets/admin.css', array(), BMS_BE_VERSION );
		wp_enqueue_script( 'bms-be-admin', BMS_BE_URL . 'assets/admin.js', array(), BMS_BE_VERSION, true );

		wp_add_inline_script(
			'bms-be-admin',
			'window.BMS_BE=' . wp_json_encode(
				array(
					'origin'    => bms_be_origin(),
					'rest'      => esc_url_raw( rest_url( BMS_BE_Rest::NS . '/' ) ),
					'nonce'     => wp_create_nonce( 'wp_rest' ),
					'preselect' => '',
				)
			) . ';',
			'before'
		);
	}

	public static function enqueue_editor() {
		wp_enqueue_script(
			'bms-be-editor',
			BMS_BE_URL . 'assets/editor.js',
			array( 'wp-hooks', 'wp-element', 'wp-compose', 'wp-components', 'wp-block-editor', 'wp-blocks', 'wp-data', 'wp-editor' ),
			BMS_BE_VERSION,
			true
		);

		wp_add_inline_script(
			'bms-be-editor',
			'window.BMS_BE_EDITOR=' . wp_json_encode( array( 'adminUrl' => self::admin_url() ) ) . ';',
			'before'
		);
	}

	/** Posts and pages worth offering, newest first. */
	private static function selectable_posts() {
		$types = get_post_types( array( 'public' => true ), 'names' );
		unset( $types['attachment'] );

		return get_posts(
			array(
				'post_type'        => array_values( $types ),
				'post_status'      => array( 'publish', 'draft', 'private', 'pending' ),
				'numberposts'      => 100,
				'orderby'          => 'modified',
				'order'            => 'DESC',
				'suppress_filters' => false,
			)
		);
	}

	public static function render() {
		if ( ! current_user_can( bms_be_cap() ) ) {
			wp_die( 'Insufficient permissions.' );
		}

		$post_id = isset( $_GET['post_id'] ) ? absint( $_GET['post_id'] ) : 0;
		$posts   = self::selectable_posts();

		if ( ! $post_id && $posts ) {
			$post_id = $posts[0]->ID;
		}

		$capture_url = $post_id ? BMS_BE_Capture::capture_url( $post_id ) : '';
		?>
		<div class="wrap">
			<h1>Block Extractor</h1>
			<p class="description">
				Loads a page on the front end, lists every block that rendered, and exports the one you pick —
				markup, matched CSS, attributes, assets and measurements at three breakpoints.
			</p>

			<form method="get" action="<?php echo esc_url( admin_url( 'tools.php' ) ); ?>">
				<input type="hidden" name="page" value="<?php echo esc_attr( self::SLUG ); ?>">
				<label for="bms-be-post"><strong>Page</strong></label>
				<select name="post_id" id="bms-be-post">
					<?php foreach ( $posts as $p ) : ?>
						<option value="<?php echo esc_attr( $p->ID ); ?>" <?php selected( $post_id, $p->ID ); ?>>
							<?php
							echo esc_html(
								( $p->post_title ? $p->post_title : '(no title)' ) .
								' — ' . $p->post_type . ' #' . $p->ID .
								( 'publish' === $p->post_status ? '' : ' [' . $p->post_status . ']' )
							);
							?>
						</option>
					<?php endforeach; ?>
				</select>
				<button type="submit" class="button">Load</button>
			</form>

			<?php if ( ! $capture_url ) : ?>
				<div class="notice notice-error"><p>That post has no viewable front-end URL.</p></div>
			<?php else : ?>

			<div class="bms-be-layout">
				<div class="bms-be-panel">
					<h2>Blocks on this page</h2>
					<div id="bms-be-tree"><p class="bms-be-empty">Waiting for the page to load…</p></div>

					<div class="bms-be-actions">
						<button type="button" class="button button-primary" id="bms-be-export" disabled>Export selected block</button>
						<button type="button" class="button" id="bms-be-copy" disabled>Copy Markdown</button>
					</div>

					<p class="bms-be-status" id="bms-be-status">Idle.</p>
					<div id="bms-be-result"></div>
				</div>

				<div class="bms-be-panel">
					<h2>Preview</h2>
					<p class="bms-be-widths">
						<button type="button" class="button is-active" data-bms-width="1440">Desktop 1440</button>
						<button type="button" class="button" data-bms-width="810">Tablet 810</button>
						<button type="button" class="button" data-bms-width="390">Mobile 390</button>
					</p>
					<div id="bms-be-stage">
						<iframe id="bms-be-frame" src="<?php echo esc_url( $capture_url ); ?>" title="Capture preview"></iframe>
					</div>
					<p class="description">
						The export runs this frame at 1440, 810 and 390&nbsp;px in turn, so media queries and the
						measurements taken at each width are the real ones.
					</p>
				</div>
			</div>

			<?php endif; ?>
		</div>
		<?php
	}
}
