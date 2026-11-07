<?php
/**
 * Turns a captured payload into a folder of files (and a zip, when ZipArchive exists)
 * under uploads/bms-block-extractor/.
 *
 * The file split is deliberate: each artefact is separately readable, so you can open
 * styles.css on its own rather than digging through one giant JSON.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class BMS_BE_Bundle {

	const DIRNAME = 'bms-block-extractor';

	/** @return array|WP_Error */
	public static function write( array $payload ) {
		$uploads = wp_upload_dir();
		if ( ! empty( $uploads['error'] ) ) {
			return new WP_Error( 'bms_be_uploads', $uploads['error'] );
		}

		$slug = self::slug( $payload );
		$base = trailingslashit( $uploads['basedir'] ) . self::DIRNAME;
		$dir  = $base . '/' . $slug;
		$url  = trailingslashit( $uploads['baseurl'] ) . self::DIRNAME . '/' . $slug;

		if ( ! wp_mkdir_p( $dir ) ) {
			return new WP_Error( 'bms_be_mkdir', 'Could not create ' . $dir );
		}

		// Keep the parent folder from being browsable on servers that allow it.
		if ( ! file_exists( $base . '/index.php' ) ) {
			file_put_contents( $base . '/index.php', "<?php // Silence is golden." );
		}

		$files = self::files( $payload );

		foreach ( $files as $name => $contents ) {
			if ( false === file_put_contents( $dir . '/' . $name, $contents ) ) {
				return new WP_Error( 'bms_be_write', 'Could not write ' . $name );
			}
		}

		$zipped   = false;
		$download = $url . '/bundle.json';

		if ( class_exists( 'ZipArchive' ) ) {
			$zip_path = $dir . '/' . $slug . '.zip';
			$zip      = new ZipArchive();
			if ( true === $zip->open( $zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
				foreach ( $files as $name => $contents ) {
					$zip->addFromString( $slug . '/' . $name, $contents );
				}
				$zip->close();
				$zipped   = true;
				$download = $url . '/' . $slug . '.zip';
			}
		}

		$total = 0;
		foreach ( $files as $contents ) {
			$total += strlen( $contents );
		}

		return array(
			'slug'     => $slug,
			'dir'      => $dir,
			'download' => $download,
			'zipped'   => $zipped,
			'files'    => array_keys( $files ),
			'summary'  => array(
				'rules' => isset( $payload['css']['rules'] ) ? count( $payload['css']['rules'] ) : 0,
				'nodes' => self::node_count( $payload ),
				'size'  => size_format( $total ),
			),
		);
	}

	private static function slug( array $payload ) {
		$name = isset( $payload['block']['name'] ) ? $payload['block']['name'] : 'block';
		$name = str_replace( '/', '-', $name );
		return sanitize_title( $name ) . '-' . gmdate( 'Ymd-His' ) . '-' . wp_generate_password( 6, false, false );
	}

	private static function node_count( array $payload ) {
		if ( isset( $payload['breakpoints']['desktop']['computed']['totalNodes'] ) ) {
			return (int) $payload['breakpoints']['desktop']['computed']['totalNodes'];
		}
		return 0;
	}

	/** @return array<string,string> filename => contents */
	private static function files( array $payload ) {
		$json = static function ( $data ) {
			return wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		};

		$files = array(
			'README.md'    => self::readme( $payload ),
			'block.json'   => $json(
				array(
					'name'        => $payload['block']['name'],
					'attributes'  => $payload['block']['attributes'],
					'innerBlocks' => $payload['block']['innerBlocks'],
				)
			),
			'markup.html'  => $payload['markup'],
			'styles.css'   => self::stylesheet( $payload ),
			'variables.json' => $json( isset( $payload['variables'] ) ? $payload['variables'] : array() ),
			'assets.json'  => $json( $payload['assets'] ),
			'scripts.json' => $json( $payload['scripts'] ),
			'bundle.json'  => $json( $payload ),
		);

		foreach ( (array) $payload['breakpoints'] as $key => $bp ) {
			$files[ 'computed-' . sanitize_key( $key ) . '.json' ] = $json( $bp );
		}

		return $files;
	}

	/**
	 * Rebuilds a real stylesheet from the matched rules: @font-face and @keyframes
	 * first, then unconditional rules, then one block per media/supports/container
	 * condition so the responsive behaviour stays readable.
	 */
	private static function stylesheet( array $payload ) {
		$css       = $payload['css'];
		$out       = array();
		$block_url = isset( $payload['meta']['page']['url'] ) ? $payload['meta']['page']['url'] : '';

		$out[] = '/*';
		$out[] = ' * ' . $payload['block']['name'];
		$out[] = ' * Captured from ' . $block_url;
		$out[] = ' * ' . count( $css['rules'] ) . ' matching rules. "context" rules target an ancestor of the';
		$out[] = ' * block and are included because they set inherited or containing values.';
		$out[] = ' */';
		$out[] = '';

		foreach ( $css['fontFaces'] as $face ) {
			$out[] = $face['css'];
		}
		foreach ( $css['keyframes'] as $kf ) {
			$out[] = $kf['css'];
		}
		if ( $css['fontFaces'] || $css['keyframes'] ) {
			$out[] = '';
		}

		$groups = array();
		foreach ( $css['rules'] as $rule ) {
			$conditions = array();
			if ( ! empty( $rule['supports'] ) ) {
				$conditions[] = '@supports ' . $rule['supports'];
			}
			if ( ! empty( $rule['media'] ) ) {
				$conditions[] = '@media ' . $rule['media'];
			}
			if ( ! empty( $rule['container'] ) ) {
				$conditions[] = '@container ' . $rule['container'];
			}
			$key = implode( "\x1f", $conditions );
			if ( ! isset( $groups[ $key ] ) ) {
				$groups[ $key ] = array(
					'conditions' => $conditions,
					'rules'      => array(),
				);
			}
			$groups[ $key ]['rules'][] = $rule;
		}

		// Unconditional first, then conditional groups in the order they were found.
		// Built by hand rather than sorted so discovery order — i.e. cascade order — survives.
		$ordered = array();
		if ( isset( $groups[''] ) ) {
			$ordered[] = $groups[''];
			unset( $groups[''] );
		}
		foreach ( $groups as $group ) {
			$ordered[] = $group;
		}

		foreach ( $ordered as $group ) {
			$depth = count( $group['conditions'] );
			foreach ( $group['conditions'] as $i => $condition ) {
				$out[] = str_repeat( "\t", $i ) . $condition . ' {';
			}
			foreach ( $group['rules'] as $rule ) {
				if ( 'context' === $rule['scope'] ) {
					$out[] = str_repeat( "\t", $depth ) . '/* context: ancestor of the block */';
				}
				$out[] = str_repeat( "\t", $depth ) . $rule['css'];
			}
			for ( $i = $depth - 1; $i >= 0; $i-- ) {
				$out[] = str_repeat( "\t", $i ) . '}';
			}
			$out[] = '';
		}

		if ( ! empty( $css['externalSheets'] ) ) {
			$out[] = '/* Stylesheets that could not be read (cross-origin) — load these separately:';
			foreach ( $css['externalSheets'] as $sheet ) {
				$out[] = ' *   ' . $sheet['href'];
			}
			$out[] = ' */';
		}

		return implode( "\n", $out ) . "\n";
	}

	private static function readme( array $payload ) {
		$block = $payload['block'];
		$css   = $payload['css'];
		$page  = isset( $payload['meta']['page'] ) ? $payload['meta']['page'] : array();

		$lines = array();
		$lines[] = '# ' . $block['name'];
		$lines[] = '';
		$lines[] = 'Captured by BMS Block Extractor ' . BMS_BE_VERSION . ' on ' . $payload['meta']['generatedAt'] . '.';
		$lines[] = '';
		$lines[] = '- **Page:** ' . ( isset( $page['title'] ) ? $page['title'] : '' ) . ' — ' . ( isset( $page['url'] ) ? $page['url'] : '' );
		$lines[] = '- **Nested blocks:** ' . count( $block['innerBlocks'] );
		$lines[] = '- **CSS rules matched:** ' . count( $css['rules'] );
		$lines[] = '- **Breakpoints captured:** ' . implode( ', ', array_map(
			static function ( $bp ) {
				return $bp['label'] . ' (' . $bp['width'] . 'px)';
			},
			(array) $payload['breakpoints']
		) );
		$lines[] = '';
		$lines[] = '## Files';
		$lines[] = '';
		$lines[] = '| File | What it holds |';
		$lines[] = '|---|---|';
		$lines[] = '| `markup.html` | The block exactly as it rendered, outermost element included. |';
		$lines[] = '| `styles.css` | Every CSS rule that matches something in the block, grouped by media/supports condition. Rules marked `context` target an ancestor and are there for inherited values. |';
		$lines[] = '| `block.json` | Editor attributes for this block and every nested block. This is the settings panel, as data. |';
		$lines[] = '| `variables.json` | CSS custom properties resolved on the block root — usually the theme design tokens. |';
		$lines[] = '| `computed-*.json` | Per-node computed styles and box sizes at each breakpoint, with user-agent defaults removed. |';
		$lines[] = '| `assets.json` | Images (with natural vs rendered size), background images, font files, embedded media. |';
		$lines[] = '| `scripts.json` | Scripts loaded on the page, plus every `data-`/`aria-`/`role` attribute inside the block. |';
		$lines[] = '| `bundle.json` | All of the above, unsplit. |';
		$lines[] = '';
		$lines[] = '## Nested block outline';
		$lines[] = '';
		if ( empty( $block['innerBlocks'] ) ) {
			$lines[] = '_None._';
		} else {
			foreach ( $block['innerBlocks'] as $inner ) {
				$lines[] = '- `' . $inner['name'] . '`';
			}
		}
		$lines[] = '';
		$lines[] = '## Known limits';
		$lines[] = '';
		$lines[] = '- Behaviour driven by JavaScript is *described* (`scripts.json`) but not extracted. Sliders, accordions and lightboxes need reimplementing.';
		$lines[] = '- Cross-origin stylesheets cannot be read; any are listed at the bottom of `styles.css`.';
		$lines[] = '- `:hover`, `:focus` and `::before`/`::after` rules are captured, because the pseudo part is stripped only to *test* the selector — the rule text is kept whole.';
		$lines[] = '- Dynamic blocks are a snapshot of one render, not the query behind it.';
		$lines[] = '';

		return implode( "\n", $lines );
	}
}
