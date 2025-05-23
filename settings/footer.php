<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Footer file
 *
 * @package   theme_boost_training
 * @copyright 2025 Eduardo Kraus {@link http://eduardokraus.com}
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die;

// Footer section.
$page = new admin_settingpage("theme_boost_training_footer", get_string("footersettings", "theme_boost_training"));

$setting = new admin_setting_configcolourpicker("theme_boost_training/footer_background_color",
    get_string("footer_background_color", "theme_boost_training"),
    get_string("footer_background_color_desc", "theme_boost_training"), "#000819");
$setting->set_updatedcallback("theme_reset_all_caches");
$page->add($setting);

for ($i = 1; $i <= 4; $i++) {

    $setting = new admin_setting_configtext("theme_boost_training/footer_title_{$i}",
        get_string("footer_title", "theme_boost_training", $i),
        get_string("footer_title_desc", "theme_boost_training", $i), "");
    $page->add($setting);

    $setting = new admin_setting_confightmleditor("theme_boost_training/footer_html_{$i}",
        get_string("footer_html", "theme_boost_training", $i),
        get_string("footer_html_desc", "theme_boost_training", $i), "");
    $page->add($setting);
}

$settings->add($page);
