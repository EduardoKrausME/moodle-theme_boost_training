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
 * @package     theme_boost_training
 * @copyright   2024 Eduardo Kraus https://eduardokraus.com/
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die;

$page = new admin_settingpage('theme_boost_training_footer',
    get_string('settings_footer_heading', 'theme_boost_training'));

$footer = get_string('content_type_footer', 'theme_boost_training');
if (get_config('theme_boost_training', 'footer_type') != 0) {
    $description = get_string('content_type_footer_desc', 'theme_boost_training', $footer) . "<br>";

    $emptytext = get_string('content_type_empty', 'theme_boost_training');

    $text = get_string('editor_link_footer_all', 'theme_boost_training');
    $html = "<a class='btn btn-info mt-1 mb-2'
                href='{$CFG->wwwroot}/theme/boost_training/_editor/?chave=footer&editlang=all'>{$text}</a>";
    if (!isset(get_config("theme_boost_training", "footer_htmleditor_all")[3])) {
        $html = "{$html} <strong class='alert-warning'>{$emptytext}</strong>";
    }
    $description .= "{$html}<br>";

    if ($CFG->langmenu) {
        $listoftranslations = get_string_manager()->get_list_of_translations();
        $langname = $listoftranslations[$CFG->lang];

        $text = get_string('editor_link_footer', 'theme_boost_training', $langname);
        $html = "<a class='btn btn-info mt-1 mb-2'
                    href='{$CFG->wwwroot}/theme/boost_training/_editor/?chave=footer&editlang={$CFG->lang}'>{$text}</a>";
        if (!isset(get_config("theme_boost_training", "footer_htmleditor_{$CFG->lang}")[3])) {
            $html = "{$html} <strong class='alert-warning'>{$emptytext}</strong>";
        }
        $description .= "{$html}<br>";

        foreach ($listoftranslations as $langkey => $langname) {
            if ($CFG->lang == $langkey) {
                continue;
            }

            $text = get_string('editor_link_footer', 'theme_boost_training', $langname);
            $html = "<a class='btn btn-info mt-1'
                        href='{$CFG->wwwroot}/theme/boost_training/_editor/?chave=footer&editlang={$langkey}'>{$text}</a>";
            if (!isset(get_config("theme_boost_training", "footer_htmleditor_{$langkey}")[3])) {
                $html = "{$html} <strong class='alert-warning'>{$emptytext}</strong>";
            }
            $description .= "{$html}<br>";
        }
    }
} else {
    $description = get_string('content_type_footer_desc', 'theme_boost_training');
}
$choices = [
    0 => get_string("content_type_default", 'theme_boost_training'),
    1 => get_string("content_type_html", 'theme_boost_training'),
];
$setting = new admin_setting_configselect('theme_boost_training/footer_type',
    get_string('content_type_footer', 'theme_boost_training'),
    $description, 0, $choices);
$page->add($setting);
$PAGE->requires->js_call_amd('theme_boost_training/settings', 'autosubmit', [$setting->get_id()]);

if (get_config('theme_boost_training', 'footer_type') == 0) {
    $setting = new admin_setting_heading('theme_boost_training_footerblock_description',
        get_string('footerblock_description', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtextarea('theme_boost_training/footer_description',
        get_string('footer_description', 'theme_boost_training'),
        get_string('footer_description_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_heading('theme_boost_training_footerblock_links',
        get_string('footerblock_links', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/footer_links_title',
        get_string('footer_links_title', 'theme_boost_training'), '',
        get_string("footer_links_title_default", "theme_boost_training"));
    $page->add($setting);

    $setting = new admin_setting_configtextarea('theme_boost_training/footer_links',
        get_string('footerblink', 'theme_boost_training') . ' 2',
        get_string('footerblink_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_heading('theme_boost_training_footerblock_social',
        get_string('footerblock_social', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/footer_social_title',
        get_string('footer_social_title', 'theme_boost_training'),
        get_string('footer_social_title_desc', 'theme_boost_training'),
        get_string("footer_social_title_default", "theme_boost_training"));
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/social_facebook',
        get_string('social_facebook', 'theme_boost_training'),
        get_string('social_facebook_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/social_youtube',
        get_string('social_youtube', 'theme_boost_training'),
        get_string('social_youtube_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/social_linkedin',
        get_string('social_linkedin', 'theme_boost_training'),
        get_string('social_linkedin_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/social_twitter',
        get_string('social_twitter', 'theme_boost_training'),
        get_string('social_twitter_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/social_instagram',
        get_string('social_instagram', 'theme_boost_training'),
        get_string('social_instagram_desc', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_heading('theme_boost_training_footerblock_contact',
        get_string('footerblock_contact', 'theme_boost_training') . ' 4 ', '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/contact_footer_title',
        get_string('footer_contact_title', 'theme_boost_training'),
        get_string('footer_contact_title_desc', 'theme_boost_training'),
        get_string("footer_contact_title_default", "theme_boost_training"));
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/contact_address',
        get_string('contact_address', 'theme_boost_training'), '', '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/contact_phone',
        get_string('contact_phone', 'theme_boost_training'), '', '');
    $page->add($setting);

    $setting = new admin_setting_configtext('theme_boost_training/contact_email',
        get_string('contact_email', 'theme_boost_training'), '', '');
    $page->add($setting);

    $setting = new admin_setting_heading('theme_boost_training_footerblock_copywriter',
        get_string('footerblock_copywriter', 'theme_boost_training'), '');
    $page->add($setting);

    $setting = new admin_setting_configcheckbox('theme_boost_training/footer_show_copywriter',
        get_string('footer_show_copywriter', 'theme_boost_training'),
        get_string('footer_show_copywriter_desc', 'theme_boost_training'), 1);
    $page->add($setting);
}

$settings->add($page);