<?php
/**
 * Plugin Name:       Site Feature Dump
 * Description:       Enumerates everything the active theme and plugins register — Customizer panels/sections/controls, theme mods, admin screens, blocks, REST routes, shortcodes, widgets, post meta keys and namespaced option rows — as copyable Markdown or downloadable JSON. Built to document Kadence, Rank Math and LiteSpeed Cache feature-by-feature.
 * Version:           1.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            BMS
 * License:           GPL-2.0-or-later
 *
 * Read-only: it never writes an option, setting or post.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BMS_Feature_Dump {

	const CAP  = 'manage_options';
	const SLUG = 'bms-feature-dump';

	/**
	 * Where each product keeps its data. `options` are option_name prefixes,
	 * `meta` are postmeta key prefixes, `rest` are REST namespaces.
	 */
	private static function sources() {
		return array(
			'kadence' => array(
				'label'   => 'Kadence (theme + blocks)',
				'options' => array( 'kadence', 'theme_mods_kadence' ),
				'meta'    => array( '_kad_', 'kadence' ),
				'rest'    => array( 'kadence-blocks', 'kadence' ),
				'types'   => array( 'kadence_element', 'kadence_conversion', 'kadence_form', 'kadence_query' ),
			),
			'rank_math' => array(
				'label'   => 'Rank Math SEO',
				'options' => array( 'rank_math', 'rank-math' ),
				'meta'    => array( 'rank_math' ),
				'rest'    => array( 'rankmath' ),
				'types'   => array(),
			),
			'litespeed' => array(
				'label'   => 'LiteSpeed Cache',
				'options' => array( 'litespeed', 'litespeed-cache' ),
				'meta'    => array( 'litespeed' ),
				'rest'    => array( 'litespeed' ),
				'types'   => array(),
			),
			'woocommerce' => array(
				'label'   => 'WooCommerce',
				'options' => array( 'woocommerce_' ),
				'meta'    => array( '_price', '_stock', '_sku' ),
				'rest'    => array( 'wc' ),
				'types'   => array( 'product' ),
			),
		);
	}

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_' . self::SLUG . '_json', array( __CLASS__, 'download_json' ) );
	}

	public static function menu() {
		add_management_page( 'Feature Dump', 'Feature Dump', self::CAP, self::SLUG, array( __CLASS__, 'render_page' ) );
	}

	/* ─── Helpers ────────────────────────────────────────────────────────── */

	/** Keeps giant serialized blobs from making the dump unusable. */
	private static function shorten( $value, $depth = 0 ) {
		if ( is_array( $value ) ) {
			if ( $depth > 8 ) {
				return '…(deeper levels trimmed)';
			}
			$out = array();
			foreach ( $value as $k => $v ) {
				$out[ $k ] = self::shorten( $v, $depth + 1 );
			}
			return $out;
		}
		if ( is_string( $value ) && strlen( $value ) > 1200 ) {
			return substr( $value, 0, 1200 ) . '…(' . strlen( $value ) . ' chars total)';
		}
		if ( is_object( $value ) ) {
			return '(object ' . get_class( $value ) . ')';
		}
		return $value;
	}

	private static function matches( $needle, ...$haystacks ) {
		if ( '' === $needle ) {
			return true;
		}
		foreach ( $haystacks as $h ) {
			if ( is_string( $h ) && false !== stripos( $h, $needle ) ) {
				return true;
			}
		}
		return false;
	}

	private static function scalar( $v ) {
		if ( is_bool( $v ) ) return $v ? 'true' : 'false';
		if ( is_null( $v ) ) return '—';
		if ( is_array( $v ) ) return '`' . wp_json_encode( $v ) . '`';
		if ( '' === $v ) return '—';
		return '`' . (string) $v . '`';
	}

	private static function json_block( $data ) {
		return "```json\n" . wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n```";
	}

	/* ─── Collectors ─────────────────────────────────────────────────────── */

	/**
	 * Panels/sections/controls only exist once `customize_register` has fired,
	 * which normally happens only on the Customizer screen. Build a manager and
	 * fire it ourselves so the theme declares everything.
	 */
	private static function collect_customizer() {
		$out = array( 'panels' => array(), 'orphan_sections' => array(), 'error' => null );

		try {
			global $wp_customize;
			if ( ! isset( $wp_customize ) || ! ( $wp_customize instanceof WP_Customize_Manager ) ) {
				require_once ABSPATH . WPINC . '/class-wp-customize-manager.php';
				$wp_customize = new WP_Customize_Manager(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
			}
			do_action( 'customize_register', $wp_customize );
			$wpc = $wp_customize;
		} catch ( \Throwable $e ) {
			$out['error'] = $e->getMessage();
			return $out;
		}

		$sections_by_panel   = array();
		$controls_by_section = array();

		foreach ( $wpc->sections() as $section ) {
			$sections_by_panel[ $section->panel ? $section->panel : '' ][] = $section;
		}
		foreach ( $wpc->controls() as $control ) {
			$controls_by_section[ $control->section ][] = $control;
		}

		$describe = static function ( $section ) use ( $controls_by_section ) {
			$controls = array();
			foreach ( $controls_by_section[ $section->id ] ?? array() as $control ) {
				$settings = array();
				foreach ( (array) $control->settings as $setting ) {
					if ( is_object( $setting ) ) {
						$settings[ $setting->id ] = array(
							'default'   => $setting->default,
							'transport' => $setting->transport,
							'value'     => self::shorten( $setting->value() ),
						);
					}
				}
				$controls[] = array(
					'id'          => $control->id,
					'label'       => (string) $control->label,
					'type'        => $control->type,
					'class'       => get_class( $control ),
					'description' => wp_strip_all_tags( (string) $control->description ),
					'priority'    => $control->priority,
					'choices'     => $control->choices ? $control->choices : null,
					'input_attrs' => $control->input_attrs ? $control->input_attrs : null,
					'settings'    => $settings,
				);
			}
			usort( $controls, static function ( $a, $b ) { return $a['priority'] <=> $b['priority']; } );

			return array(
				'id'          => $section->id,
				'title'       => (string) $section->title,
				'description' => wp_strip_all_tags( (string) $section->description ),
				'priority'    => $section->priority,
				'controls'    => $controls,
			);
		};

		foreach ( $wpc->panels() as $panel ) {
			$sections = array();
			foreach ( $sections_by_panel[ $panel->id ] ?? array() as $section ) {
				$sections[] = $describe( $section );
			}
			usort( $sections, static function ( $a, $b ) { return $a['priority'] <=> $b['priority']; } );
			$out['panels'][] = array(
				'id'       => $panel->id,
				'title'    => (string) $panel->title,
				'priority' => $panel->priority,
				'sections' => $sections,
			);
		}
		usort( $out['panels'], static function ( $a, $b ) { return $a['priority'] <=> $b['priority']; } );

		foreach ( $sections_by_panel[''] ?? array() as $section ) {
			$out['orphan_sections'][] = $describe( $section );
		}

		return $out;
	}

	/** Every admin screen, which is the closest thing to a map of the workflow. */
	private static function collect_admin_menu() {
		global $menu, $submenu;

		$tree = array();
		foreach ( (array) $menu as $item ) {
			if ( empty( $item[0] ) ) {
				continue;
			}
			$title = wp_strip_all_tags( preg_replace( '/<span[^>]*>.*?<\/span>/s', '', $item[0] ) );
			$title = trim( $title );
			if ( '' === $title ) {
				continue;
			}
			$slug  = $item[2] ?? '';
			$kids  = array();
			foreach ( $submenu[ $slug ] ?? array() as $sub ) {
				$kids[] = array(
					'title' => trim( wp_strip_all_tags( preg_replace( '/<span[^>]*>.*?<\/span>/s', '', $sub[0] ) ) ),
					'slug'  => $sub[2] ?? '',
					'cap'   => $sub[1] ?? '',
				);
			}
			$tree[] = array( 'title' => $title, 'slug' => $slug, 'cap' => $item[1] ?? '', 'children' => $kids );
		}
		return $tree;
	}

	/** Registered blocks — for Kadence Blocks this is the whole feature list. */
	private static function collect_blocks() {
		if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
			return array();
		}
		$blocks = array();
		foreach ( WP_Block_Type_Registry::get_instance()->get_all_registered() as $name => $type ) {
			$blocks[] = array(
				'name'       => $name,
				'title'      => (string) ( $type->title ?? '' ),
				'category'   => (string) ( $type->category ?? '' ),
				'attributes' => is_array( $type->attributes ) ? array_keys( $type->attributes ) : array(),
				'supports'   => is_array( $type->supports ) ? $type->supports : array(),
			);
		}
		usort( $blocks, static function ( $a, $b ) { return strcmp( $a['name'], $b['name'] ); } );
		return $blocks;
	}

	private static function collect_rest_routes() {
		$routes = array();
		try {
			foreach ( rest_get_server()->get_routes() as $route => $handlers ) {
				$methods = array();
				foreach ( $handlers as $h ) {
					foreach ( array_keys( (array) ( $h['methods'] ?? array() ) ) as $m ) {
						$methods[ $m ] = true;
					}
				}
				$routes[ $route ] = implode( ', ', array_keys( $methods ) );
			}
		} catch ( \Throwable $e ) {
			$routes['(error)'] = $e->getMessage();
		}
		return $routes;
	}

	/** Distinct postmeta keys matching a prefix — shows per-post features. */
	private static function collect_meta_keys( array $prefixes ) {
		global $wpdb;
		if ( ! $prefixes ) {
			return array();
		}
		$where = array();
		$args  = array();
		foreach ( $prefixes as $p ) {
			$where[] = 'meta_key LIKE %s';
			$args[]  = $wpdb->esc_like( $p ) . '%';
		}
		$sql = "SELECT meta_key, COUNT(*) AS n FROM {$wpdb->postmeta} WHERE " . implode( ' OR ', $where )
			. ' GROUP BY meta_key ORDER BY meta_key LIMIT 500';
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[ $r->meta_key ] = (int) $r->n;
		}
		return $out;
	}

	private static function collect_options( array $prefixes ) {
		global $wpdb;
		if ( ! $prefixes ) {
			return array();
		}
		$where = array();
		$args  = array();
		foreach ( $prefixes as $p ) {
			$where[] = 'option_name LIKE %s';
			$args[]  = $wpdb->esc_like( $p ) . '%';
		}
		$sql = "SELECT option_name, option_value FROM {$wpdb->options} WHERE " . implode( ' OR ', $where )
			. ' ORDER BY option_name LIMIT 400';
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[ $r->option_name ] = self::shorten( maybe_unserialize( $r->option_value ) );
		}
		return $out;
	}

	private static function collect_source( $key ) {
		$sources = self::sources();
		if ( ! isset( $sources[ $key ] ) ) {
			return null;
		}
		$src = $sources[ $key ];

		$rest = array();
		foreach ( self::collect_rest_routes() as $route => $methods ) {
			foreach ( $src['rest'] as $ns ) {
				if ( false !== stripos( $route, $ns ) ) {
					$rest[ $route ] = $methods;
					break;
				}
			}
		}

		$types = array();
		foreach ( $src['types'] as $t ) {
			if ( post_type_exists( $t ) ) {
				$obj = get_post_type_object( $t );
				$types[ $t ] = array(
					'label' => $obj->label,
					'count' => (int) wp_count_posts( $t )->publish,
				);
			}
		}

		return array(
			'label'      => $src['label'],
			'options'    => self::collect_options( $src['options'] ),
			'meta_keys'  => self::collect_meta_keys( $src['meta'] ),
			'rest'       => $rest,
			'post_types' => $types,
		);
	}

	private static function collect_everything( $source = '', $custom_prefix = '' ) {
		global $wp_registered_sidebars, $wp_registered_widgets;

		$theme = wp_get_theme();

		$post_types = array();
		foreach ( get_post_types( array(), 'objects' ) as $pt ) {
			$post_types[] = array(
				'name'       => $pt->name,
				'label'      => $pt->label,
				'public'     => (bool) $pt->public,
				'supports'   => array_keys( get_all_post_type_supports( $pt->name ) ),
				'taxonomies' => get_object_taxonomies( $pt->name ),
			);
		}

		$sidebars = array();
		foreach ( (array) $wp_registered_sidebars as $sb ) {
			$sidebars[] = array( 'id' => $sb['id'], 'name' => $sb['name'] );
		}

		$widgets = array();
		foreach ( (array) $wp_registered_widgets as $w ) {
			$widgets[ $w['id'] ] = wp_strip_all_tags( (string) ( $w['name'] ?? '' ) );
		}

		$menus = array();
		foreach ( wp_get_nav_menus() as $m ) {
			$menus[] = array( 'name' => $m->name, 'count' => $m->count );
		}

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$plugins = array();
		foreach ( get_plugins() as $file => $data ) {
			$plugins[] = array(
				'name'    => $data['Name'],
				'version' => $data['Version'],
				'active'  => is_plugin_active( $file ),
			);
		}

		global $shortcode_tags;

		$data = array(
			'generated' => gmdate( 'c' ),
			'site'      => array(
				'url'        => home_url(),
				'wp_version' => get_bloginfo( 'version' ),
				'theme'      => $theme->get( 'Name' ) . ' ' . $theme->get( 'Version' ),
				'template'   => $theme->get_template(),
			),
			'customizer'     => self::collect_customizer(),
			'theme_mods'     => self::shorten( get_theme_mods() ),
			'admin_menu'     => self::collect_admin_menu(),
			'blocks'         => self::collect_blocks(),
			'shortcodes'     => array_keys( (array) $shortcode_tags ),
			'menu_locations' => get_registered_nav_menus(),
			'menus'          => $menus,
			'widget_areas'   => $sidebars,
			'widgets'        => $widgets,
			'image_sizes'    => wp_get_registered_image_subsizes(),
			'post_types'     => $post_types,
			'taxonomies'     => array_keys( get_taxonomies() ),
			'plugins'        => $plugins,
			'sources'        => array(),
		);

		foreach ( array_keys( self::sources() ) as $key ) {
			if ( '' === $source || $source === $key ) {
				$collected = self::collect_source( $key );
				if ( $collected && ( $collected['options'] || $collected['meta_keys'] || $collected['rest'] || $collected['post_types'] ) ) {
					$data['sources'][ $key ] = $collected;
				}
			}
		}

		if ( '' !== $custom_prefix ) {
			$data['sources'][ 'custom:' . $custom_prefix ] = array(
				'label'      => 'Custom prefix “' . $custom_prefix . '”',
				'options'    => self::collect_options( array( $custom_prefix ) ),
				'meta_keys'  => self::collect_meta_keys( array( $custom_prefix ) ),
				'rest'       => array(),
				'post_types' => array(),
			);
		}

		return $data;
	}

	/* ─── Markdown ───────────────────────────────────────────────────────── */

	public static function to_markdown( array $d, $scope, $filter ) {
		$md   = array();
		$md[] = '# ' . $d['site']['theme'] . ' — feature dump';
		$md[] = '';
		$md[] = '- Site: ' . $d['site']['url'] . ' · WordPress ' . $d['site']['wp_version'] . ' · template `' . $d['site']['template'] . '`';
		$md[] = '- Generated ' . $d['generated'] . ( '' !== $filter ? ' · filter `' . $filter . '`' : '' );
		$md[] = '';

		$cz = $d['customizer'];
		if ( ! empty( $cz['error'] ) ) {
			$md[] = '> Customizer could not be enumerated: ' . $cz['error'];
			$md[] = '';
		}

		$sections = array();
		foreach ( $cz['panels'] as $p ) {
			foreach ( $p['sections'] as $s ) {
				$sections[] = array( 'panel' => $p['title'] ) + $s;
			}
		}
		foreach ( $cz['orphan_sections'] as $s ) {
			$sections[] = array( 'panel' => '(no panel)' ) + $s;
		}

		$want = static function ( $s ) use ( $scope ) {
			return 'all' === $scope || $scope === $s;
		};

		if ( $want( 'index' ) ) {
			$md[] = '## Customizer index';
			$md[] = '';
			$md[] = '| Panel | Section | Section ID | Controls |';
			$md[] = '|---|---|---|---|';
			foreach ( $sections as $s ) {
				if ( ! self::matches( $filter, $s['panel'], $s['title'], $s['id'] ) ) continue;
				$md[] = sprintf( '| %s | %s | `%s` | %d |', $s['panel'], $s['title'], $s['id'], count( $s['controls'] ) );
			}
			$md[] = '';
			$md[] = '_Filter by a Section ID then switch to **Customizer detail** to expand it._';
			$md[] = '';
		}

		if ( $want( 'customizer' ) ) {
			$md[] = '## Customizer detail';
			$md[] = '';
			foreach ( $sections as $s ) {
				$hit      = self::matches( $filter, $s['panel'], $s['title'], $s['id'] );
				$controls = array();
				foreach ( $s['controls'] as $c ) {
					if ( $hit || self::matches( $filter, $c['id'], $c['label'], $c['type'] ) ) {
						$controls[] = $c;
					}
				}
				if ( ! $controls ) continue;

				$md[] = '### ' . $s['panel'] . ' › ' . $s['title'] . '  `' . $s['id'] . '`';
				if ( $s['description'] ) $md[] = $s['description'];
				$md[] = '';
				foreach ( $controls as $c ) {
					$md[] = '- **' . ( $c['label'] ? $c['label'] : $c['id'] ) . '** — `' . $c['type'] . '` · id `' . $c['id'] . '`';
					if ( $c['description'] ) $md[] = '  - ' . $c['description'];
					if ( $c['choices'] ) {
						$pairs = array();
						foreach ( $c['choices'] as $k => $v ) {
							$pairs[] = '`' . $k . '`=' . ( is_array( $v ) ? wp_json_encode( $v ) : (string) $v );
						}
						$md[] = '  - choices: ' . implode( ', ', $pairs );
					}
					if ( $c['input_attrs'] ) $md[] = '  - input_attrs: `' . wp_json_encode( $c['input_attrs'] ) . '`';
					foreach ( $c['settings'] as $sid => $meta ) {
						$md[] = sprintf(
							'  - setting `%s` — default %s · current %s%s',
							$sid, self::scalar( $meta['default'] ), self::scalar( $meta['value'] ),
							'postMessage' === $meta['transport'] ? ' _(live preview)_' : ''
						);
					}
				}
				$md[] = '';
			}
		}

		if ( $want( 'workflow' ) ) {
			$md[] = '## Admin screens (the workflow map)';
			$md[] = '';
			foreach ( $d['admin_menu'] as $top ) {
				if ( ! self::matches( $filter, $top['title'], $top['slug'] )
					&& ! array_filter( $top['children'], static function ( $c ) use ( $filter ) {
						return self::matches( $filter, $c['title'], $c['slug'] );
					} ) ) {
					continue;
				}
				$md[] = '- **' . $top['title'] . '** — `' . $top['slug'] . '`';
				foreach ( $top['children'] as $c ) {
					$md[] = '  - ' . $c['title'] . ' — `' . $c['slug'] . '`';
				}
			}
			$md[] = '';

			$md[] = '## Menu locations';
			$md[] = '';
			foreach ( $d['menu_locations'] as $id => $label ) {
				$md[] = '- `' . $id . '` — ' . $label;
			}
			$md[] = '';

			$md[] = '## Widget areas';
			$md[] = '';
			foreach ( $d['widget_areas'] as $sb ) {
				$md[] = '- `' . $sb['id'] . '` — ' . $sb['name'];
			}
			$md[] = '';

			$md[] = '## Post types';
			$md[] = '';
			$md[] = '| Name | Label | Public | Supports |';
			$md[] = '|---|---|---|---|';
			foreach ( $d['post_types'] as $pt ) {
				if ( ! self::matches( $filter, $pt['name'], $pt['label'] ) ) continue;
				$md[] = sprintf( '| `%s` | %s | %s | %s |', $pt['name'], $pt['label'], $pt['public'] ? 'yes' : 'no', implode( ', ', $pt['supports'] ) );
			}
			$md[] = '';

			$md[] = '## Plugins';
			$md[] = '';
			foreach ( $d['plugins'] as $p ) {
				$md[] = '- ' . $p['name'] . ' ' . $p['version'] . ( $p['active'] ? ' — **active**' : '' );
			}
			$md[] = '';
		}

		if ( $want( 'blocks' ) ) {
			$md[] = '## Registered blocks';
			$md[] = '';
			foreach ( $d['blocks'] as $b ) {
				if ( ! self::matches( $filter, $b['name'], $b['title'], $b['category'] ) ) continue;
				$md[] = '- `' . $b['name'] . '` — ' . ( $b['title'] ? $b['title'] : '(no title)' )
					. ( $b['category'] ? ' · ' . $b['category'] : '' );
				if ( $b['attributes'] ) {
					$md[] = '  - attributes: ' . implode( ', ', array_map( static function ( $a ) { return '`' . $a . '`'; }, $b['attributes'] ) );
				}
			}
			$md[] = '';

			$md[] = '## Shortcodes';
			$md[] = '';
			$sc = array_filter( $d['shortcodes'], static function ( $t ) use ( $filter ) { return self::matches( $filter, $t ); } );
			$md[] = $sc ? '`' . implode( '`, `', $sc ) . '`' : '_none matched_';
			$md[] = '';
		}

		if ( $want( 'mods' ) ) {
			$md[] = '## Theme mods (where the theme stores its values)';
			$md[] = '';
			$md[] = self::json_block( self::filter_tree( $d['theme_mods'], $filter ) );
			$md[] = '';
		}

		if ( $want( 'plugin' ) ) {
			foreach ( $d['sources'] as $key => $src ) {
				$md[] = '## ' . $src['label'];
				$md[] = '';

				if ( $src['post_types'] ) {
					$md[] = '**Post types**';
					$md[] = '';
					foreach ( $src['post_types'] as $t => $info ) {
						$md[] = '- `' . $t . '` — ' . $info['label'] . ' (' . $info['count'] . ' published)';
					}
					$md[] = '';
				}

				if ( $src['meta_keys'] ) {
					$md[] = '**Per-post meta keys** — one row per feature it stores against a post';
					$md[] = '';
					foreach ( $src['meta_keys'] as $k => $n ) {
						if ( ! self::matches( $filter, $k ) ) continue;
						$md[] = '- `' . $k . '` — used on ' . $n . ' rows';
					}
					$md[] = '';
				}

				if ( $src['rest'] ) {
					$md[] = '**REST routes**';
					$md[] = '';
					foreach ( $src['rest'] as $route => $methods ) {
						if ( ! self::matches( $filter, $route ) ) continue;
						$md[] = '- `' . $route . '` — ' . $methods;
					}
					$md[] = '';
				}

				if ( $src['options'] ) {
					$md[] = '**Stored options**';
					$md[] = '';
					$md[] = self::json_block( self::filter_tree( $src['options'], $filter ) );
					$md[] = '';
				}
			}
			if ( ! $d['sources'] ) {
				$md[] = '_No matching product data found on this site._';
				$md[] = '';
			}
		}

		return implode( "\n", $md );
	}

	/** Keeps only branches whose key or scalar value matches the filter. */
	private static function filter_tree( $tree, $filter ) {
		if ( '' === $filter || ! is_array( $tree ) ) {
			return $tree;
		}
		$out = array();
		foreach ( $tree as $k => $v ) {
			if ( self::matches( $filter, (string) $k ) ) {
				$out[ $k ] = $v;
				continue;
			}
			if ( is_array( $v ) ) {
				$sub = self::filter_tree( $v, $filter );
				if ( ! empty( $sub ) ) {
					$out[ $k ] = $sub;
				}
			} elseif ( self::matches( $filter, (string) $v ) ) {
				$out[ $k ] = $v;
			}
		}
		return $out;
	}

	/* ─── Screens ────────────────────────────────────────────────────────── */

	public static function download_json() {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( self::SLUG . '_json' );

		$source = isset( $_GET['source'] ) ? sanitize_key( wp_unslash( $_GET['source'] ) ) : '';
		$data   = self::collect_everything( $source, '' );

		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=feature-dump-' . gmdate( 'Ymd-His' ) . '.json' );
		echo wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		exit;
	}

	public static function render_page() {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'Not allowed.' );
		}

		$scope  = isset( $_GET['scope'] ) ? sanitize_key( wp_unslash( $_GET['scope'] ) ) : 'index';
		$filter = isset( $_GET['filter'] ) ? sanitize_text_field( wp_unslash( $_GET['filter'] ) ) : '';
		$source = isset( $_GET['source'] ) ? sanitize_key( wp_unslash( $_GET['source'] ) ) : '';
		$prefix = isset( $_GET['prefix'] ) ? sanitize_text_field( wp_unslash( $_GET['prefix'] ) ) : '';

		$data = self::collect_everything( $source, $prefix );
		$md   = self::to_markdown( $data, $scope, $filter );

		$scopes = array(
			'index'      => '1 · Customizer index (start here)',
			'customizer' => '2 · Customizer detail (use a filter)',
			'workflow'   => '3 · Admin screens, menus, post types',
			'blocks'     => '4 · Blocks & shortcodes',
			'mods'       => '5 · Theme mods (stored values)',
			'plugin'     => '6 · Plugin data (Kadence / Rank Math / LiteSpeed)',
			'all'        => 'Everything (very large)',
		);
		?>
		<div class="wrap">
			<h1>Feature Dump</h1>
			<p>Read-only. Pick a scope, optionally narrow with a filter, then copy the Markdown.</p>

			<form method="get" style="margin:16px 0;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
				<input type="hidden" name="page" value="<?php echo esc_attr( self::SLUG ); ?>">
				<label>
					<span style="display:block;font-weight:600;margin-bottom:4px">Scope</span>
					<select name="scope">
						<?php foreach ( $scopes as $k => $l ) : ?>
							<option value="<?php echo esc_attr( $k ); ?>" <?php selected( $scope, $k ); ?>><?php echo esc_html( $l ); ?></option>
						<?php endforeach; ?>
					</select>
				</label>
				<label>
					<span style="display:block;font-weight:600;margin-bottom:4px">Product</span>
					<select name="source">
						<option value="">All detected</option>
						<?php foreach ( self::sources() as $k => $s ) : ?>
							<option value="<?php echo esc_attr( $k ); ?>" <?php selected( $source, $k ); ?>><?php echo esc_html( $s['label'] ); ?></option>
						<?php endforeach; ?>
					</select>
				</label>
				<label>
					<span style="display:block;font-weight:600;margin-bottom:4px">Filter</span>
					<input type="text" name="filter" value="<?php echo esc_attr( $filter ); ?>" placeholder="header, kadence_search, rank_math_title…" style="min-width:280px">
				</label>
				<label>
					<span style="display:block;font-weight:600;margin-bottom:4px">Extra option prefix</span>
					<input type="text" name="prefix" value="<?php echo esc_attr( $prefix ); ?>" placeholder="e.g. elementor" style="min-width:150px">
				</label>
				<button class="button button-primary">Generate</button>
				<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::SLUG . '_json&source=' . rawurlencode( $source ) ), self::SLUG . '_json' ) ); ?>">Download JSON</a>
			</form>

			<p>
				<button type="button" class="button button-secondary" id="bms-copy">Copy Markdown</button>
				<span id="bms-copied" style="margin-left:8px;color:#0a7c2f;display:none">Copied.</span>
				<span style="margin-left:12px;color:#666"><?php echo esc_html( number_format_i18n( strlen( $md ) ) ); ?> characters</span>
			</p>

			<textarea id="bms-md" readonly style="width:100%;height:60vh;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5"><?php echo esc_textarea( $md ); ?></textarea>
		</div>
		<script>
		document.getElementById('bms-copy').addEventListener('click', function () {
			var ta = document.getElementById('bms-md');
			ta.select();
			ta.setSelectionRange(0, ta.value.length);
			var done = function () {
				var el = document.getElementById('bms-copied');
				el.style.display = 'inline';
				setTimeout(function () { el.style.display = 'none'; }, 2000);
			};
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(ta.value).then(done, function () { document.execCommand('copy'); done(); });
			} else {
				document.execCommand('copy');
				done();
			}
		});
		</script>
		<?php
	}
}

BMS_Feature_Dump::init();
