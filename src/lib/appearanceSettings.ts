// Single source of truth for site appearance settings.
// Shared by the Appearance admin page and the Customizer so the two cannot drift.

export type FooterLink = { label: string; url: string };
export type FooterCol = { type: "about" | "links" | "text"; title?: string; text?: string; wide?: boolean; links?: FooterLink[] };

export interface AppearanceSettings {
  // Branding
  site_logo: string;
  logo_alt: string;                 // blank = site name
  site_favicon: string;
  logo_height: string;
  logo_max_width: string;
  logo_max_width_tablet: string;
  logo_max_width_mobile: string;
  logo_layout: string;              // logo | logo-title | logo-title-tagline
  show_site_title: string;          // legacy — superseded by logo_layout
  show_tagline: string;             // legacy — superseded by logo_layout
  // Header builder zones (JSON arrays as strings)
  header_topbar_enabled: string;
  header_topbar_left: string;
  header_topbar_center: string;
  header_topbar_right: string;
  header_topbar_right_center: string;
  header_topbar_left_center: string;
  header_main_left: string;
  header_main_center: string;
  header_main_right: string;
  header_main_right_center: string;
  header_main_left_center: string;
  header_bottombar_enabled: string;
  header_bottombar_left: string;
  header_bottombar_center: string;
  header_bottombar_right: string;
  header_bottombar_right_center: string;
  header_bottombar_left_center: string;
  // Mobile/tablet header builder zones (separate layout below the breakpoint)
  header_m_topbar_enabled: string;
  header_m_topbar_left: string;
  header_m_topbar_center: string;
  header_m_topbar_right: string;
  header_m_topbar_right_center: string;
  header_m_topbar_left_center: string;
  header_m_main_left: string;
  header_m_main_center: string;
  header_m_main_right: string;
  header_m_main_right_center: string;
  header_m_main_left_center: string;
  header_m_bottombar_enabled: string;
  header_m_bottombar_left: string;
  header_m_bottombar_center: string;
  header_m_bottombar_right: string;
  header_m_bottombar_right_center: string;
  header_m_bottombar_left_center: string;
  header_mobile_breakpoint: string;
  header_bg_color_tablet: string;
  header_bg_color_mobile: string;
  // Primary Navigation item
  hnav_spacing: string;             // em between items
  hnav_stretch: string;             // fill available width
  hnav_open_on: string;             // hover | click
  hnav_style: string;               // standard | full-height | underline | full-height-underline
  hnav_color: string;
  hnav_color_hover: string;
  hnav_color_active: string;
  hnav_bg: string;
  hnav_bg_hover: string;
  hnav_bg_active: string;
  hnav_parent_active: string;
  hnav_font: string;
  hnav_font_size: string;
  hnav_font_weight: string;
  hnav_transform: string;           // none | uppercase | capitalize
  hnav_dd_bg: string;
  hnav_dd_color: string;
  hnav_dd_color_hover: string;
  hnav_dd_width: string;            // px
  hnav_dd_radius: string;           // px
  hnav_dd_divider: string;
  hnav_mega_width: string;
  hnav_badge_bg: string;
  hnav_badge_text: string;
  // Header Search item
  hsearch_display: string;          // input | icon (icon opens a modal)
  hsearch_style: string;            // default | bordered
  hsearch_placeholder: string;
  hsearch_icon_size: string;        // em
  hsearch_icon_size_tablet: string;
  hsearch_icon_size_mobile: string;
  hsearch_color: string;
  hsearch_color_hover: string;
  hsearch_bg: string;
  hsearch_bg_hover: string;
  hsearch_pad_top: string;
  hsearch_pad_right: string;
  hsearch_pad_bottom: string;
  hsearch_pad_left: string;
  hsearch_pad_unit: string;         // em | px
  hsearch_margin_top: string;
  hsearch_margin_right: string;
  hsearch_margin_bottom: string;
  hsearch_margin_left: string;
  hsearch_modal_text: string;
  hsearch_modal_text_hover: string;
  hsearch_modal_bg: string;
  hsearch_modal_bg_tablet: string;
  hsearch_modal_bg_mobile: string;
  header_button_text: string;
  header_button_url: string;
  header_html_content: string;
  hrow_topbar_layout: string;
  hrow_topbar_height: string;
  hrow_topbar_bg: string;
  hrow_topbar_border_top: string;
  hrow_topbar_border_bottom: string;
  /** @deprecated shared fallback — see hrow_topbar_border_width_top/_bottom */
  hrow_topbar_border_width: string;
  hrow_topbar_border_width_top: string;
  hrow_topbar_border_width_bottom: string;
  hrow_topbar_padding: string;
  hrow_topbar_trans_bg: string;
  hrow_main_layout: string;
  hrow_main_height: string;
  hrow_main_bg: string;
  hrow_main_border_top: string;
  hrow_main_border_bottom: string;
  /** @deprecated shared fallback — see hrow_main_border_width_top/_bottom */
  hrow_main_border_width: string;
  hrow_main_border_width_top: string;
  hrow_main_border_width_bottom: string;
  hrow_main_padding: string;
  hrow_main_trans_bg: string;
  hrow_bottombar_layout: string;
  hrow_bottombar_height: string;
  hrow_bottombar_bg: string;
  hrow_bottombar_border_top: string;
  hrow_bottombar_border_bottom: string;
  /** @deprecated shared fallback — see hrow_bottombar_border_width_top/_bottom */
  hrow_bottombar_border_width: string;
  hrow_bottombar_border_width_top: string;
  hrow_bottombar_border_width_bottom: string;
  hrow_bottombar_padding: string;
  hrow_bottombar_trans_bg: string;
  h1_size: string;
  h1_weight: string;
  h1_color: string;
  h1_lh: string;
  h2_size: string;
  h2_weight: string;
  h2_color: string;
  h2_lh: string;
  h3_size: string;
  h3_weight: string;
  h3_color: string;
  h3_lh: string;
  h4_size: string;
  h4_weight: string;
  h4_color: string;
  h4_lh: string;
  h5_size: string;
  h5_weight: string;
  h5_color: string;
  h5_lh: string;
  h6_size: string;
  h6_weight: string;
  h6_color: string;
  h6_lh: string;
  header_m_popup: string;
  offcanvas_side: string;
  offcanvas_layout: string;
  offcanvas_anim: string;
  offcanvas_width: string;
  offcanvas_bg: string;
  offcanvas_text: string;
  offcanvas_align: string;
  offcanvas_close_size: string;
  palette_sets: string;
  palette_active: string;
  btn_border_color: string;
  btn_border_color_hover: string;
  btn_shadow: string;
  btn_shadow_hover: string;
  btn2_border_color: string;
  btn2_border_color_hover: string;
  btn2_shadow: string;
  btn2_shadow_hover: string;
  btno_border_color: string;
  btno_border_color_hover: string;
  btno_shadow: string;
  btno_shadow_hover: string;
  link_style: string;
  link_color: string;
  link_color_hover: string;
  font_smoothing: string;
  google_subsets: string;
  site_background: string;
  content_background: string;
  header_conditions: string;
  hide_header: string;
  // Global palette — any colour setting may hold "palette1".."palette9"
  // instead of a hex value, so a whole site re-skins from one place.
  palette1: string; palette2: string; palette3: string;
  palette4: string; palette5: string; palette6: string;
  palette7: string; palette8: string; palette9: string;
  palette_dark1: string; palette_dark2: string; palette_dark3: string;
  palette_dark4: string; palette_dark5: string; palette_dark6: string;
  palette_dark7: string; palette_dark8: string; palette_dark9: string;
  // Colors
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  color_text: string;
  color_heading: string;
  color_bg: string;
  color_bg_dark: string;
  dark_mode: string;
  // Typography
  font_heading: string;
  font_body: string;
  font_size_base: string;
  font_weight_heading: string;
  line_height_body: string;
  // Header
  header_sticky: string;
  header_transparent: string;
  header_height: string;
  header_logo_position: string;
  header_bg_color: string;
  header_text_color: string;
  header_border: string;
  // Footer
  footer_bg_color: string;
  footer_text_color: string;
  footer_heading_color: string;
  // Footer builder zones (rows x left/center/right), mirroring the header
  footer_toprow_enabled: string;
  footer_toprow_left: string;
  footer_toprow_center: string;
  footer_toprow_right: string;
  footer_toprow_right_center: string;
  footer_toprow_left_center: string;
  footer_main_left: string;
  footer_main_center: string;
  footer_main_right: string;
  footer_main_right_center: string;
  footer_main_left_center: string;
  footer_bottomrow_enabled: string;
  footer_bottomrow_left: string;
  footer_bottomrow_center: string;
  footer_bottomrow_right: string;
  footer_bottomrow_right_center: string;
  footer_bottomrow_left_center: string;
  footer_widgets: string;       // JSON: Record<widgetId, FooterWidget>
  footer_cols: string;          // JSON: FooterCol[] — legacy, migrated into footer_widgets
  footer_bottom_links: string;  // JSON: FooterLink[]
  footer_bottom_text: string;
  // Button styles — base, secondary and outline
  btn_bg: string; btn_text: string; btn_bg_hover: string; btn_text_hover: string;
  btn_radius: string; btn_pad_y: string; btn_pad_x: string; btn_font_size: string; btn_font_weight: string;
  btn2_bg: string; btn2_text: string; btn2_bg_hover: string; btn2_text_hover: string;
  btn2_radius: string; btn2_pad_y: string; btn2_pad_x: string; btn2_font_size: string; btn2_font_weight: string;
  btno_border: string; btno_text: string; btno_bg_hover: string; btno_text_hover: string;
  btno_radius: string; btno_pad_y: string; btno_pad_x: string; btno_border_width: string;

  // Transparent header — the state used when a document opts into it
  thdr_text: string; thdr_text_hover: string; thdr_bg: string;
  thdr_border: string; thdr_height: string; thdr_logo: string;

  // Sticky header
  hsticky_rows: string;        // main | all
  hsticky_shrink: string;
  hsticky_shrink_height: string;
  hsticky_bg: string; hsticky_text: string; hsticky_shadow: string;

  // Footer rows
  footer_toprow_bg: string; footer_toprow_text: string; footer_toprow_link: string; footer_toprow_padding: string;
  footer_toprow_border_top: string; footer_toprow_border_bottom: string;
  footer_toprow_border_width_top: string; footer_toprow_border_width_bottom: string;
  footer_main_bg: string; footer_main_text: string; footer_main_link: string; footer_main_padding: string;
  footer_main_border_top: string; footer_main_border_bottom: string;
  footer_main_border_width_top: string; footer_main_border_width_bottom: string;
  footer_bottomrow_bg: string; footer_bottomrow_text: string; footer_bottomrow_link: string; footer_bottomrow_padding: string;
  footer_bottomrow_border_top: string; footer_bottomrow_border_bottom: string;
  footer_bottomrow_border_width_top: string; footer_bottomrow_border_width_bottom: string;

  // Dark mode palette
  dark_bg: string; dark_text: string; dark_heading: string; dark_primary: string;
  dark_header_bg: string; dark_header_text: string; dark_footer_bg: string; dark_footer_text: string;

  // Posts/Pages Layout — site-wide defaults. A post or page can override any
  // of these from its own Design panel; "default" means "use these".
  page_layout: string;            // normal | narrow | fullwidth | left-sidebar | right-sidebar
  page_content_style: string;     // boxed | unboxed
  page_spacing: string;           // default | enable | disable | top-only | bottom-only
  page_title_show: string;
  // Page Layout — the page's own title area, mirroring the single-post screen.
  //
  // Pages had four settings to a post's forty: a width, a content style, a
  // spacing and a title toggle. Everything else a post could say about its
  // title area — where it sits, how it aligns, what appears in it and in what
  // order — a page simply could not, so a landing page and an article were the
  // same document with different words.
  page_title_layout: string;        // in-content | above-content
  page_title_align: string;         // left | center | right
  page_title_align_tablet: string;
  page_title_align_mobile: string;
  page_elements: string;            // JSON: { id: string; visible: boolean }[]
  page_sidebar: string;
  page_feature_show: string;
  page_comments_show: string;
  page_title_font: string;
  page_title_size: string;
  page_title_weight: string;
  page_title_color: string;
  page_crumb_color: string;
  page_crumb_hover_color: string;
  page_crumb_font_size: string;
  page_meta_color: string;
  page_meta_hover_color: string;
  page_meta_font_size: string;
  page_site_bg: string;
  page_site_bg_tablet: string;
  page_site_bg_mobile: string;
  page_content_bg: string;
  page_content_bg_tablet: string;
  page_content_bg_mobile: string;
  post_layout: string;
  post_content_style: string;
  post_spacing: string;
  post_title_show: string;
  post_meta_show: string;
  post_feature_show: string;
  // Single Post Layout — the post's own title area and after-content blocks.
  post_title_layout: string;        // in-content | above-content
  post_title_align: string;         // left | center | right
  post_title_align_tablet: string;
  post_title_align_mobile: string;
  post_elements: string;            // JSON: { id: string; visible: boolean }[]
  post_sidebar: string;
  post_author_box_show: string;
  post_nav_show: string;
  post_related_show: string;
  post_related_orderby: string;     // random | date | title
  post_related_order: string;       // asc | desc
  post_related_count: string;       // 1..6
  post_title_font: string;
  post_title_size: string;
  post_title_weight: string;
  post_title_color: string;
  post_cat_color: string;
  post_cat_hover_color: string;
  post_cat_font_size: string;
  post_crumb_color: string;
  post_crumb_hover_color: string;
  post_crumb_font_size: string;
  post_meta_color: string;
  post_meta_hover_color: string;
  post_meta_font_size: string;
  post_excerpt_color: string;
  post_excerpt_font_size: string;
  post_site_bg: string;
  post_site_bg_tablet: string;
  post_site_bg_mobile: string;
  post_content_bg: string;
  post_content_bg_tablet: string;
  post_content_bg_mobile: string;
  post_tags_show: string;
  post_comments_show: string;
  post_author_box_boxed: string;
  comments_auto_approve: string;

  // Form notifications. Credentials are *not* here — SMTP comes from the
  // environment; these are the non-secret preferences that go with it.
  forms_notify_enabled: string;
  forms_notify_to: string;
  forms_notify_subject: string;
  forms_autoreply_enabled: string;
  forms_autoreply_subject: string;
  forms_autoreply_body: string;
  /** JSON: Record<widgetId, SidebarWidget> */
  sidebar_widgets: string;
  archive_layout: string;
  archive_content_style: string;
  archive_spacing: string;
  archive_columns: string;        // 1..4
  archive_title_show: string;
  // Archive design. `archive_header_bg` and `archive_body_bg` were read by
  // siteCss from the day the bands were built but never declared here and
  // never shown in a panel, so the two strips of colour behind every archive
  // were whatever the code said and nothing could change them. The rest is
  // the card design: one preset for the whole grid, then a colour per part.
  archive_card_style: string;     // classic | elevated | overlay | list | minimal
  archive_header_bg: string;
  archive_body_bg: string;
  archive_title_color: string;
  archive_desc_color: string;
  archive_count_color: string;
  archive_card_bg: string;
  archive_card_border: string;
  archive_card_radius: string;    // px
  archive_card_title_color: string;
  archive_card_title_hover: string;
  archive_card_meta_color: string;
  archive_card_excerpt_color: string;
  archive_card_term_color: string;
  archive_card_more_color: string;
  // The category filter row above the grid. Shown unless switched off, and
  // its own colours rather than the theme's tint of the surrounding text.
  archive_chips_show: string;         // "false" hides the row
  archive_chip_color: string;
  archive_chip_bg: string;
  archive_chip_active_color: string;
  archive_chip_active_bg: string;
  // Search results archive
  search_title_show: string;
  search_title_layout: string;      // in-content | above-content
  search_title_align: string;       // left | center | right
  search_title_align_tablet: string;
  search_title_align_mobile: string;
  search_title_color: string;
  search_archive_layout: string;    // normal | narrow | fullwidth | left-sidebar | right-sidebar
  search_sidebar: string;
  search_content_style: string;     // boxed | unboxed
  search_columns: string;           // 1..4
  search_elements: string;          // JSON: { id: string; visible: boolean }[]
  search_item_title_font: string;
  search_item_title_size: string;
  search_item_title_weight: string;
  search_cat_color: string;
  search_cat_hover_color: string;
  search_cat_font_size: string;
  search_meta_color: string;
  search_meta_hover_color: string;
  search_meta_font_size: string;
  search_site_bg: string;
  search_site_bg_tablet: string;
  search_site_bg_mobile: string;
  search_content_bg: string;
  search_content_bg_tablet: string;
  search_content_bg_mobile: string;
  // Scripts
  script_head: string;
  script_body_end: string;
  // Maintenance
  maintenance_mode: string;
  /** "true": injected scripts wait for the first interaction (or 6s). */
  scripts_delay: string;
  // Speed
  /** YouTube/Vimeo embeds render as a poster + play button; the player loads on click. */
  perf_video_facade: string;
  /** Content links are fetched on hover/touchstart so the click lands on a cached page. */
  perf_hover_prefetch: string;
  /** <link rel=preconnect> for the third-party hosts the content references. */
  perf_preconnect: string;
  /** Google Fonts files are copied to this server and served from the site's own domain. */
  fonts_local: string;
  /** JSON list of uploaded font faces, see lib/customFonts.ts. Managed by /api/fonts. */
  custom_fonts: string;
  /** Default gap between blocks in content, px. Empty = 16. */
  content_block_gap: string;
  /** Same on phones; empty follows desktop. */
  content_block_gap_mobile: string;
  // Scroll to top (lib/siteExtras.ts)
  scroll_top_enabled: string;
  scroll_top_position: string;   // right | left
  scroll_top_shape: string;      // circle | rounded | square
  scroll_top_size: string;
  scroll_top_bottom: string;
  scroll_top_offset: string;     // px scrolled before it appears
  scroll_top_bg: string;
  scroll_top_color: string;
  scroll_top_mobile: string;
  // Reading progress bar
  reading_progress_enabled: string;
  reading_progress_pages: string;
  reading_progress_position: string; // top | bottom
  reading_progress_height: string;
  reading_progress_color: string;
  // Reading time
  reading_time_post: string;
  reading_time_cards: string;
  reading_time_wpm: string;
  reading_time_label: string;
  // Archive pagination
  archive_pagination: string;    // numbers | loadmore | infinite
  archive_loadmore_label: string;
  /** Ask LiteSpeed (when it fronts the app) to cache public pages; purged on every publish. */
  cache_litespeed: string;
  /** How long LiteSpeed may keep a page, in seconds. */
  cache_ttl: string;
  maintenance_title: string;
  maintenance_message: string;
  maintenance_bg_color: string;
}

export const defaults: AppearanceSettings = {
  site_logo: "",
  logo_alt: "",
  site_favicon: "",
  logo_height: "32",
  logo_max_width: "",
  logo_max_width_tablet: "",
  logo_max_width_mobile: "",
  logo_layout: "",
  show_site_title: "true",
  show_tagline: "false",
  header_topbar_enabled: "false",
  header_topbar_left: "[]",
  header_topbar_center: "[]",
  header_topbar_right: "[]",
  header_topbar_right_center: "[]",
  header_topbar_left_center: "[]",
  header_main_left: '["logo"]',
  header_main_center: "[]",
  header_main_right: '["navigation","search"]',
  header_main_right_center: "[]",
  header_main_left_center: "[]",
  header_bottombar_enabled: "false",
  header_bottombar_left: "[]",
  header_bottombar_center: "[]",
  header_bottombar_right: "[]",
  header_bottombar_right_center: "[]",
  header_bottombar_left_center: "[]",
  header_m_topbar_enabled: "false",
  header_m_topbar_left: "[]",
  header_m_topbar_center: "[]",
  header_m_topbar_right: "[]",
  header_m_topbar_right_center: "[]",
  header_m_topbar_left_center: "[]",
  header_m_main_left: '["logo"]',
  header_m_main_center: "[]",
  header_m_main_right: '["navigation"]',
  header_m_main_right_center: "[]",
  header_m_main_left_center: "[]",
  header_m_bottombar_enabled: "false",
  header_m_bottombar_left: "[]",
  header_m_bottombar_center: "[]",
  header_m_bottombar_right: "[]",
  header_m_bottombar_right_center: "[]",
  header_m_bottombar_left_center: "[]",
  header_mobile_breakpoint: "1024",
  header_bg_color_tablet: "",
  header_bg_color_mobile: "",
  hnav_spacing: "1.25",
  hnav_stretch: "false",
  hnav_open_on: "hover",
  hnav_style: "standard",
  hnav_color: "",
  hnav_color_hover: "",
  hnav_color_active: "",
  hnav_bg: "",
  hnav_bg_hover: "",
  hnav_bg_active: "",
  hnav_parent_active: "false",
  hnav_font: "",
  hnav_font_size: "",
  hnav_font_weight: "",
  hnav_transform: "none",
  hnav_dd_bg: "",
  hnav_dd_color: "",
  hnav_dd_color_hover: "",
  hnav_dd_width: "200",
  hnav_dd_radius: "8",
  hnav_dd_divider: "",
  hnav_mega_width: "900",
  hnav_badge_bg: "",
  hnav_badge_text: "",
  hsearch_display: "input",
  hsearch_style: "default",
  hsearch_placeholder: "Search…",
  hsearch_icon_size: "1",
  hsearch_icon_size_tablet: "",
  hsearch_icon_size_mobile: "",
  hsearch_color: "",
  hsearch_color_hover: "",
  hsearch_bg: "",
  hsearch_bg_hover: "",
  hsearch_pad_top: "",
  hsearch_pad_right: "",
  hsearch_pad_bottom: "",
  hsearch_pad_left: "",
  hsearch_pad_unit: "em",
  hsearch_margin_top: "",
  hsearch_margin_right: "",
  hsearch_margin_bottom: "",
  hsearch_margin_left: "",
  hsearch_modal_text: "",
  hsearch_modal_text_hover: "",
  hsearch_modal_bg: "",
  hsearch_modal_bg_tablet: "",
  hsearch_modal_bg_mobile: "",
  header_button_text: "Get Started",
  header_button_url: "#",
  header_html_content: "",
  hrow_topbar_layout: "standard",
  hrow_topbar_height: "",
  hrow_topbar_bg: "",
  hrow_topbar_border_top: "",
  hrow_topbar_border_bottom: "",
  hrow_topbar_border_width: "1",
  hrow_topbar_border_width_top: "",
  hrow_topbar_border_width_bottom: "",
  hrow_topbar_padding: "",
  hrow_topbar_trans_bg: "",
  hrow_main_layout: "standard",
  hrow_main_height: "",
  hrow_main_bg: "",
  hrow_main_border_top: "",
  hrow_main_border_bottom: "",
  hrow_main_border_width: "1",
  hrow_main_border_width_top: "",
  hrow_main_border_width_bottom: "",
  hrow_main_padding: "",
  hrow_main_trans_bg: "",
  hrow_bottombar_layout: "standard",
  hrow_bottombar_height: "",
  hrow_bottombar_bg: "",
  hrow_bottombar_border_top: "",
  hrow_bottombar_border_bottom: "",
  hrow_bottombar_border_width: "1",
  hrow_bottombar_border_width_top: "",
  hrow_bottombar_border_width_bottom: "",
  hrow_bottombar_padding: "",
  hrow_bottombar_trans_bg: "",
  h1_size: "",
  h1_weight: "",
  h1_color: "",
  h1_lh: "",
  h2_size: "",
  h2_weight: "",
  h2_color: "",
  h2_lh: "",
  h3_size: "",
  h3_weight: "",
  h3_color: "",
  h3_lh: "",
  h4_size: "",
  h4_weight: "",
  h4_color: "",
  h4_lh: "",
  h5_size: "",
  h5_weight: "",
  h5_color: "",
  h5_lh: "",
  h6_size: "",
  h6_weight: "",
  h6_color: "",
  h6_lh: "",
  header_m_popup: "[]",
  offcanvas_side: "right",
  offcanvas_layout: "sidepanel",
  offcanvas_anim: "fade",
  offcanvas_width: "400",
  offcanvas_bg: "",
  offcanvas_text: "",
  offcanvas_align: "left",
  offcanvas_close_size: "24",
  palette_sets: "",
  palette_active: "1",
  btn_border_color: "",
  btn_border_color_hover: "",
  btn_shadow: "",
  btn_shadow_hover: "",
  btn2_border_color: "",
  btn2_border_color_hover: "",
  btn2_shadow: "",
  btn2_shadow_hover: "",
  btno_border_color: "",
  btno_border_color_hover: "",
  btno_shadow: "",
  btno_shadow_hover: "",
  link_style: "standard",
  link_color: "",
  link_color_hover: "",
  font_smoothing: "false",
  google_subsets: "",
  site_background: "",
  content_background: "",
  header_conditions: "[]",
  hide_header: "false",
  palette1: "#0ea5e9", palette2: "#0284c7", palette3: "#0f172a",
  palette4: "#334155", palette5: "#64748b", palette6: "#cbd5e1",
  palette7: "#e2e8f0", palette8: "#f8fafc", palette9: "#ffffff",
  palette_dark1: "", palette_dark2: "", palette_dark3: "",
  palette_dark4: "", palette_dark5: "", palette_dark6: "",
  palette_dark7: "", palette_dark8: "", palette_dark9: "",
  color_primary: "#0ea5e9",
  color_secondary: "#64748b",
  color_accent: "#f59e0b",
  color_text: "#0f172a",
  color_heading: "#0f172a",
  color_bg: "#ffffff",
  color_bg_dark: "#0f172a",
  dark_mode: "off",
  font_heading: "Inter",
  font_body: "Inter",
  font_size_base: "16",
  font_weight_heading: "700",
  line_height_body: "1.7",
  header_sticky: "true",
  header_transparent: "false",
  header_height: "64",
  header_logo_position: "left",
  header_bg_color: "#ffffff",
  header_text_color: "#0f172a",
  header_border: "true",
  footer_bg_color: "#0f172a",
  footer_text_color: "#94a3b8",
  footer_heading_color: "#ffffff",
  footer_toprow_enabled: "false",
  footer_toprow_left: "[]",
  footer_toprow_center: "[]",
  footer_toprow_right: "[]",
  footer_toprow_right_center: "[]",
  footer_toprow_left_center: "[]",
  footer_main_left: '["widget1"]',
  footer_main_center: "[]",
  footer_main_right: '["widget2"]',
  footer_main_right_center: "[]",
  footer_main_left_center: "[]",
  footer_bottomrow_enabled: "true",
  footer_bottomrow_left: "[]",
  footer_bottomrow_center: "[]",
  footer_bottomrow_right: '["copyright"]',
  footer_bottomrow_right_center: "[]",
  footer_bottomrow_left_center: "[]",
  footer_widgets: "{}",
  footer_cols: JSON.stringify([
    { type: "about", wide: true, text: "Welcome to our site." },
    { type: "links", title: "Important Links", links: [] },
  ] as FooterCol[]),
  footer_bottom_links: "[]",
  footer_bottom_text: "",
  btn_bg: "", btn_text: "", btn_bg_hover: "", btn_text_hover: "",
  btn_radius: "8", btn_pad_y: "10", btn_pad_x: "18", btn_font_size: "14", btn_font_weight: "600",
  btn2_bg: "", btn2_text: "", btn2_bg_hover: "", btn2_text_hover: "",
  btn2_radius: "8", btn2_pad_y: "10", btn2_pad_x: "18", btn2_font_size: "14", btn2_font_weight: "600",
  btno_border: "", btno_text: "", btno_bg_hover: "", btno_text_hover: "",
  btno_radius: "8", btno_pad_y: "10", btno_pad_x: "18", btno_border_width: "1",

  thdr_text: "", thdr_text_hover: "", thdr_bg: "", thdr_border: "", thdr_height: "", thdr_logo: "",

  hsticky_rows: "main",
  hsticky_shrink: "false",
  hsticky_shrink_height: "56",
  hsticky_bg: "", hsticky_text: "", hsticky_shadow: "true",

  footer_toprow_bg: "", footer_toprow_text: "", footer_toprow_link: "", footer_toprow_padding: "",
  footer_toprow_border_top: "", footer_toprow_border_bottom: "",
  footer_toprow_border_width_top: "", footer_toprow_border_width_bottom: "",
  footer_main_bg: "", footer_main_text: "", footer_main_link: "", footer_main_padding: "",
  footer_main_border_top: "", footer_main_border_bottom: "",
  footer_main_border_width_top: "", footer_main_border_width_bottom: "",
  footer_bottomrow_bg: "", footer_bottomrow_text: "", footer_bottomrow_link: "", footer_bottomrow_padding: "",
  footer_bottomrow_border_top: "", footer_bottomrow_border_bottom: "",
  footer_bottomrow_border_width_top: "", footer_bottomrow_border_width_bottom: "",

  dark_bg: "#0f172a", dark_text: "#e2e8f0", dark_heading: "#f8fafc", dark_primary: "",
  dark_header_bg: "", dark_header_text: "", dark_footer_bg: "", dark_footer_text: "",

  page_layout: "normal",
  page_content_style: "unboxed",
  page_spacing: "default",
  page_title_show: "true",
  page_title_layout: "in-content",
  page_title_align: "left",
  page_title_align_tablet: "left",
  page_title_align_mobile: "left",
  // Title first, and the other two off.
  //
  // A page is not an article: it has no publish date worth showing and usually
  // sits outside the blog's hierarchy, so a breadcrumb and a byline are noise
  // on it by default. They are one click away for the sites that want them —
  // which is the opposite of the post default, deliberately.
  page_elements: JSON.stringify([
    { id: "title",      visible: true },
    { id: "breadcrumb", visible: false },
    { id: "meta",       visible: false },
  ]),
  page_sidebar: "sidebar1",
  page_feature_show: "true",
  page_comments_show: "false",
  page_title_font: "",
  page_title_size: "",
  page_title_weight: "",
  page_title_color: "",
  page_crumb_color: "",
  page_crumb_hover_color: "",
  page_crumb_font_size: "",
  page_meta_color: "",
  page_meta_hover_color: "",
  page_meta_font_size: "",
  page_site_bg: "",
  page_site_bg_tablet: "",
  page_site_bg_mobile: "",
  page_content_bg: "",
  page_content_bg_tablet: "",
  page_content_bg_mobile: "",
  post_layout: "normal",
  post_content_style: "unboxed",
  post_spacing: "default",
  post_title_show: "true",
  post_meta_show: "true",
  post_feature_show: "true",
  post_title_layout: "in-content",
  post_title_align: "left",
  post_title_align_tablet: "left",
  post_title_align_mobile: "left",
  post_elements: JSON.stringify([
    { id: "breadcrumb", visible: true },
    { id: "categories", visible: true },
    { id: "title",      visible: true },
    { id: "meta",       visible: true },
    { id: "excerpt",    visible: false },
  ]),
  post_sidebar: "sidebar1",
  post_author_box_show: "false",
  post_nav_show: "true",
  post_related_show: "true",
  post_related_orderby: "random",
  post_related_order: "desc",
  post_related_count: "3",
  post_title_font: "",
  post_title_size: "",
  post_title_weight: "",
  post_title_color: "",
  post_cat_color: "",
  post_cat_hover_color: "",
  post_cat_font_size: "",
  post_crumb_color: "",
  post_crumb_hover_color: "",
  post_crumb_font_size: "",
  post_meta_color: "",
  post_meta_hover_color: "",
  post_meta_font_size: "",
  post_excerpt_color: "",
  post_excerpt_font_size: "",
  post_site_bg: "",
  post_site_bg_tablet: "",
  post_site_bg_mobile: "",
  post_content_bg: "",
  post_content_bg_tablet: "",
  post_content_bg_mobile: "",
  post_tags_show: "true",
  post_comments_show: "true",
  post_author_box_boxed: "true",
  comments_auto_approve: "false",
  forms_notify_enabled: "false",
  forms_notify_to: "",
  forms_notify_subject: "New {{form}} submission on {{site}}",
  forms_autoreply_enabled: "false",
  forms_autoreply_subject: "We received your message",
  forms_autoreply_body:
    "Thanks for getting in touch — we have your message and will reply soon.\n\n— {{site}}",
  sidebar_widgets: JSON.stringify({
    swidget1: { type: "search", title: "Search" },
    swidget2: { type: "recent", title: "Recent Posts", count: 5 },
    swidget3: { type: "categories", title: "Categories" },
  }),
  archive_layout: "normal",
  // "unboxed", matching what the site actually renders: siteCss falls back to
  // unboxed for a kind whose content style was never saved, so a fresh site's
  // archive is unboxed while this panel used to show "Boxed" selected — the
  // first save then silently changed the look to what the panel had claimed.
  archive_content_style: "unboxed",
  archive_spacing: "default",
  archive_columns: "3",
  archive_title_show: "true",
  // Every colour defaults to empty: unset means "whatever the theme already
  // did", so an existing site looks exactly as it did until someone picks one.
  archive_card_style: "classic",
  archive_header_bg: "",
  archive_body_bg: "",
  archive_title_color: "",
  archive_desc_color: "",
  archive_count_color: "",
  archive_card_bg: "",
  archive_card_border: "",
  archive_card_radius: "",
  archive_card_title_color: "",
  archive_card_title_hover: "",
  archive_card_meta_color: "",
  archive_card_excerpt_color: "",
  archive_card_term_color: "",
  archive_card_more_color: "",
  archive_chips_show: "true",
  archive_chip_color: "",
  archive_chip_bg: "",
  archive_chip_active_color: "",
  archive_chip_active_bg: "",
  search_title_show: "true",
  search_title_layout: "in-content",
  search_title_align: "left",
  search_title_align_tablet: "left",
  search_title_align_mobile: "left",
  search_title_color: "",
  search_archive_layout: "normal",
  search_sidebar: "sidebar1",
  search_content_style: "boxed",
  search_columns: "3",
  search_elements: JSON.stringify([
    { id: "feature",    visible: true },
    { id: "categories", visible: true },
    { id: "title",      visible: true },
    { id: "meta",       visible: true },
    { id: "excerpt",    visible: true },
    { id: "readmore",   visible: true },
  ]),
  search_item_title_font: "",
  search_item_title_size: "",
  search_item_title_weight: "",
  search_cat_color: "",
  search_cat_hover_color: "",
  search_cat_font_size: "",
  search_meta_color: "",
  search_meta_hover_color: "",
  search_meta_font_size: "",
  search_site_bg: "",
  search_site_bg_tablet: "",
  search_site_bg_mobile: "",
  search_content_bg: "",
  search_content_bg_tablet: "",
  search_content_bg_mobile: "",
  script_head: "",
  script_body_end: "",
  maintenance_mode: "false",
  scripts_delay: "false",
  perf_video_facade: "true",
  perf_hover_prefetch: "true",
  perf_preconnect: "true",
  fonts_local: "true",
  custom_fonts: "",
  content_block_gap: "16",
  content_block_gap_mobile: "",
  scroll_top_enabled: "false",
  scroll_top_position: "right",
  scroll_top_shape: "circle",
  scroll_top_size: "44",
  scroll_top_bottom: "24",
  scroll_top_offset: "400",
  scroll_top_bg: "",
  scroll_top_color: "",
  scroll_top_mobile: "true",
  reading_progress_enabled: "false",
  reading_progress_pages: "false",
  reading_progress_position: "top",
  reading_progress_height: "3",
  reading_progress_color: "",
  reading_time_post: "true",
  reading_time_cards: "false",
  reading_time_wpm: "220",
  reading_time_label: "min read",
  archive_pagination: "numbers",
  archive_loadmore_label: "Load more",
  cache_litespeed: "true",
  cache_ttl: "86400",
  maintenance_title: "We're under maintenance",
  maintenance_message: "We'll be back soon. Thanks for your patience.",
  maintenance_bg_color: "#0f172a",
};

// ── Site identity ───────────────────────────────────────────────────────────

export type LogoLayout = "logo" | "logo-title" | "logo-title-tagline";

export const LOGO_LAYOUTS: { value: LogoLayout; label: string }[] = [
  { value: "logo",               label: "Logo" },
  { value: "logo-title",         label: "Logo & Title" },
  { value: "logo-title-tagline", label: "Logo, Title & Tagline" },
];

/**
 * The layout actually in force. Sites saved before `logo_layout` existed only
 * have the two boolean toggles, so an unset value is read back off those rather
 * than silently flipping the title back on.
 */
export function resolveLogoLayout(
  s: { logo_layout?: string; show_site_title?: string; show_tagline?: string }
): LogoLayout {
  const v = s.logo_layout;
  if (v === "logo" || v === "logo-title" || v === "logo-title-tagline") return v;
  if (s.show_site_title === "false") return "logo";
  return s.show_tagline === "true" ? "logo-title-tagline" : "logo-title";
}

export const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat",
  "Raleway", "Nunito", "Source Sans Pro", "Playfair Display",
  "Merriweather", "PT Serif", "Lora", "DM Sans", "Space Grotesk",
  "Sora", "Plus Jakarta Sans", "Outfit", "Geist", "Geist Mono",
  // Every family above is Latin-only for the scripts below, so an Arabic,
  // Urdu, Hindi or Hebrew site could only choose a font that draws none of
  // its text — the browser fell back to whatever the visitor's system had,
  // while the page still downloaded and preloaded the Latin files. These
  // all carry Latin too, so product names and numbers match.
  "Cairo", "Tajawal", "Almarai", "IBM Plex Sans Arabic", "Noto Kufi Arabic",
  "Noto Sans Arabic", "Readex Pro", "Changa", "El Messiri", "Amiri", "Noto Naskh Arabic",
  "Noto Nastaliq Urdu", "Vazirmatn",
  "Hind", "Mukta", "Noto Sans Devanagari",
  "Heebo", "Assistant", "Rubik",
];

/**
 * Which non-Latin scripts a family in the list above draws, for the scripts
 * the picker warns about. Latin (and Cyrillic, Greek, Vietnamese, which most
 * of the Latin families cover) is not tracked; a family missing here draws
 * none of these. Uploaded fonts are unknown and never warned about.
 */
const FONT_SCRIPTS: Record<string, readonly string[]> = {
  "Open Sans": ["hebrew"],
  Poppins: ["devanagari"],
  Cairo: ["arabic"], Tajawal: ["arabic"], Almarai: ["arabic"], "IBM Plex Sans Arabic": ["arabic"],
  "Noto Kufi Arabic": ["arabic"], "Noto Sans Arabic": ["arabic"], "Readex Pro": ["arabic"],
  Changa: ["arabic"], "El Messiri": ["arabic"], Amiri: ["arabic"], "Noto Naskh Arabic": ["arabic"],
  "Noto Nastaliq Urdu": ["arabic"], Vazirmatn: ["arabic"],
  Hind: ["devanagari"], Mukta: ["devanagari"], "Noto Sans Devanagari": ["devanagari"],
  Heebo: ["hebrew"], Assistant: ["hebrew"], Rubik: ["hebrew", "arabic"],
};

/** The scripts the picker can vouch for, keyed as Google names its subsets. */
export const CHECKED_SCRIPTS: Record<string, string> = { arabic: "Arabic", devanagari: "Devanagari", hebrew: "Hebrew" };

/**
 * True when `family` is a listed Google font known not to draw `script`.
 * False when it does, when the script is not one we check, or when the
 * family is unknown (an upload) — the warning is only ever certain.
 */
export function fontLacksScript(family: string | undefined, script: string): boolean {
  if (!CHECKED_SCRIPTS[script]) return false;
  const f = family || "Inter";
  if (!GOOGLE_FONTS.includes(f)) return false;
  return !(FONT_SCRIPTS[f] ?? []).includes(script);
}

/** Families from the list that draw `script`, for the warning's suggestion. */
export function fontsForScript(script: string): string[] {
  return GOOGLE_FONTS.filter((f) => (FONT_SCRIPTS[f] ?? []).includes(script));
}

// ── Customizer ──────────────────────────────────────────────────────────────
// The Customizer edits everything Appearance does, plus a few keys that live
// elsewhere in the admin (site identity, homepage) and its own custom_css.

export interface CustomizerExtras {
  site_name: string;
  site_description: string;
  custom_css: string;
  homepage_id: string;
  posts_per_page: string;
  posts_page_id: string;
}

export type CustomizerSettings = AppearanceSettings & CustomizerExtras;

export const customizerDefaults: CustomizerSettings = {
  ...defaults,
  site_name: "",
  site_description: "",
  custom_css: "",
  homepage_id: "",
  posts_per_page: "10",
  posts_page_id: "",
};

// ── Footer widgets ──────────────────────────────────────────────────────────

export type FooterWidget = {
  title?: string;
  type: "text" | "links" | "about";
  text?: string;
  links?: FooterLink[];
};

/**
 * A sidebar widget.
 *
 * Deliberately a superset of `FooterWidget` rather than a reuse: a sidebar
 * wants dynamic blocks a footer column never does — recent posts, the category
 * and tag clouds, a search box — and folding those into the footer type would
 * mean every footer column had to answer for options it cannot use.
 */
export type SidebarWidget = {
  title?: string;
  type: "text" | "links" | "search" | "recent" | "categories" | "tags";
  text?: string;
  links?: FooterLink[];
  /** How many items the dynamic types show. */
  count?: number;
};

export const SIDEBAR_WIDGET_IDS = ["swidget1", "swidget2", "swidget3", "swidget4"] as const;

export const SIDEBAR_WIDGET_TYPES: { id: SidebarWidget["type"]; label: string }[] = [
  { id: "search",     label: "Search" },
  { id: "recent",     label: "Recent Posts" },
  { id: "categories", label: "Categories" },
  { id: "tags",       label: "Tag Cloud" },
  { id: "links",      label: "Link List" },
  { id: "text",       label: "Text" },
];

export function parseSidebarWidgets(raw: string): Record<string, SidebarWidget> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, SidebarWidget>) : {};
  } catch {
    return {};
  }
}

export const FOOTER_WIDGET_IDS = ["widget1", "widget2", "widget3", "widget4", "widget5", "widget6"] as const;

export function parseWidgets(raw: string): Record<string, FooterWidget> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * One-time upgrade: the footer used to be a flat `footer_cols` array. Fold those
 * columns into widget1..widgetN so an existing footer survives the move to zones.
 */
export function migrateFooterCols(raw: string): Record<string, FooterWidget> {
  let cols: FooterCol[] = [];
  try { cols = JSON.parse(raw || "[]"); } catch { return {}; }
  const out: Record<string, FooterWidget> = {};
  cols.slice(0, FOOTER_WIDGET_IDS.length).forEach((c, i) => {
    out[FOOTER_WIDGET_IDS[i]] = {
      title: c.title,
      type: c.type,
      text: c.text,
      links: c.links,
    };
  });
  return out;
}

// ── Search archive elements ─────────────────────────────────────────────────

export type SearchElement = { id: string; visible: boolean };

export const SEARCH_ELEMENT_LABELS: Record<string, string> = {
  feature: "Feature",
  categories: "Categories",
  title: "Title",
  meta: "Meta",
  excerpt: "Excerpt",
  readmore: "Readmore",
};

/** The title-area blocks of a single post, in the order they are drawn. */
export const POST_ELEMENT_LABELS: Record<string, string> = {
  breadcrumb: "Breadcrumb",
  categories: "Categories",
  title: "Title",
  meta: "Meta",
  excerpt: "Excerpt",
};

export function parsePostElements(raw: string): SearchElement[] {
  const fallback: SearchElement[] = Object.keys(POST_ELEMENT_LABELS).map((id) => ({
    id,
    // Excerpts repeat the intro on most posts, so they stay off until asked for.
    visible: id !== "excerpt",
  }));
  return mergeElements(raw, fallback);
}

/**
 * A page's title area has three elements, not a post's five.
 *
 * Categories and excerpt belong to an article. A page has neither, and offering
 * them would be offering two rows that could never render anything.
 */
export const PAGE_ELEMENT_LABELS: Record<string, string> = {
  title: "Title",
  breadcrumb: "Breadcrumb",
  meta: "Meta",
};

export function parsePageElements(raw: string): SearchElement[] {
  const fallback: SearchElement[] = Object.keys(PAGE_ELEMENT_LABELS).map((id) => ({
    id,
    // Only the title, for the reason given beside `page_elements`: a breadcrumb
    // and a byline are noise on a page that is not an article.
    visible: id === "title",
  }));
  return mergeElements(raw, fallback);
}

export function parseSearchElements(raw: string): SearchElement[] {
  return mergeElements(raw, Object.keys(SEARCH_ELEMENT_LABELS).map((id) => ({ id, visible: true })));
}

function mergeElements(raw: string, fallback: SearchElement[]): SearchElement[] {
  try {
    const v = JSON.parse(raw || "null");
    if (!Array.isArray(v) || v.length === 0) return fallback;
    // Keep any element the stored list forgot, so new elements aren't invisible.
    const seen = new Set(v.map((e: SearchElement) => e.id));
    return [...v, ...fallback.filter((f) => !seen.has(f.id))];
  } catch {
    return fallback;
  }
}
