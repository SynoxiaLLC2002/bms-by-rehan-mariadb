/**
 * BMS Block Extractor — block editor toolbar.
 *
 * Adds a dropdown to every block's toolbar. The two copy actions are instant and
 * need no front-end round trip; "Open in Extractor" hands off to the Tools screen
 * for the full markup + CSS capture.
 *
 * Written against wp.element.createElement directly so the plugin needs no build step.
 */
( function ( wp ) {
	'use strict';

	if ( ! wp || ! wp.hooks || ! wp.element ) { return; }

	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var BlockControls = wp.blockEditor.BlockControls;
	var ToolbarGroup = wp.components.ToolbarGroup;
	var ToolbarDropdownMenu = wp.components.ToolbarDropdownMenu;
	var MenuGroup = wp.components.MenuGroup;
	var MenuItem = wp.components.MenuItem;
	var createHigherOrderComponent = wp.compose.createHigherOrderComponent;
	var cfg = window.BMS_BE_EDITOR || {};

	function notify( message, type ) {
		var notices = wp.data.dispatch( 'core/notices' );
		if ( ! notices ) { return; }
		if ( type === 'error' ) { notices.createErrorNotice( message, { type: 'snackbar' } ); }
		else { notices.createInfoNotice( message, { type: 'snackbar' } ); }
	}

	function copy( text, what ) {
		function fallback() {
			var ta = document.createElement( 'textarea' );
			ta.value = text;
			ta.style.cssText = 'position:fixed;left:-9999px;top:0';
			document.body.appendChild( ta );
			ta.select();
			var ok = false;
			try { ok = document.execCommand( 'copy' ); } catch ( e ) {}
			document.body.removeChild( ta );
			notify( ok ? what + ' copied.' : 'Could not reach the clipboard.', ok ? 'info' : 'error' );
		}

		if ( navigator.clipboard && navigator.clipboard.writeText ) {
			navigator.clipboard.writeText( text ).then( function () {
				notify( what + ' copied (' + Math.max( 1, Math.round( text.length / 1024 ) ) + ' KB).' );
			} ).catch( fallback );
		} else {
			fallback();
		}
	}

	/** Full attribute tree including every nested block, which is what a rebuild needs. */
	function serializeTree( block ) {
		return {
			name: block.name,
			attributes: block.attributes,
			innerBlocks: ( block.innerBlocks || [] ).map( serializeTree )
		};
	}

	var withExtractorControls = createHigherOrderComponent( function ( BlockEdit ) {
		return function ( props ) {
			if ( ! props.isSelected ) {
				return el( BlockEdit, props );
			}

			return el(
				Fragment,
				null,
				el( BlockEdit, props ),
				el(
					BlockControls,
					{ group: 'other' },
					el(
						ToolbarGroup,
						null,
						el(
							ToolbarDropdownMenu,
							{
								icon: 'download',
								label: 'Block Extractor',
								popoverProps: { placement: 'bottom-start' }
							},
							function () {
								return el(
									MenuGroup,
									null,
									el( MenuItem, {
										onClick: function () {
											var block = wp.data.select( 'core/block-editor' ).getBlock( props.clientId );
											copy( JSON.stringify( serializeTree( block ), null, 2 ), 'Attribute JSON' );
										}
									}, 'Copy attribute JSON' ),
									el( MenuItem, {
										onClick: function () {
											var block = wp.data.select( 'core/block-editor' ).getBlock( props.clientId );
											copy( wp.blocks.serialize( block ), 'Block markup' );
										}
									}, 'Copy block markup' ),
									el( MenuItem, {
										onClick: function () {
											var postId = wp.data.select( 'core/editor' ).getCurrentPostId();
											var saved = ! wp.data.select( 'core/editor' ).isEditedPostDirty();
											if ( ! saved ) {
												notify( 'Save the post first — the extractor reads the rendered front end.', 'error' );
												return;
											}
											window.open( cfg.adminUrl + '&post_id=' + postId, '_blank', 'noopener' );
										}
									}, 'Open in Extractor (markup + CSS)' )
								);
							}
						)
					)
				)
			);
		};
	}, 'withExtractorControls' );

	wp.hooks.addFilter( 'editor.BlockEdit', 'bms-block-extractor/toolbar', withExtractorControls );
}( window.wp ) );
