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
 * Settings file
 *
 * @package   theme_boost_training
 * @copyright 2025 Eduardo Kraus {@link http://eduardokraus.com}
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if (is_siteadmin()) {
    $settings = new theme_boost_admin_settingspage_tabs('themesettingboost_training',
        get_string('configtitle', 'theme_boost_training'));

    $ADMIN->add('themes', new admin_category('theme_boost_training', get_string('pluginname', 'theme_boost_training')));

    require_once("settings/general.php");
    require_once("settings/advanced.php");
    require_once("settings/userprofile.php");
    require_once("settings/accessibility.php");
    require_once("settings/logos.php");
    require_once("settings/course.php");
    require_once("settings/footer.php");
}
