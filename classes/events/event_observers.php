<?php
// This file is part of the theme_boost_training plugin for Moodle - http://moodle.org/
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
 * Event observers
 *
 * @package   theme_boost_training
 * @copyright 2025 Eduardo Kraus https://eduardokraus.com/
 * @license   http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace theme_boost_training\events;

use core\event\base;
use core\event\course_module_deleted;
use Exception;

/**
 * Class event_observers
 *
 * @package local_kopere_dashboard\events
 */
class event_observers {

    /**
     * Function process_event
     *
     * @param base $event
     *
     * @throws Exception
     */
    public static function process_event(base $event) {
        $eventname = str_replace("\\\\", "\\", $event->eventname);
        switch ($eventname) {
            case '\core\event\course_deleted':
            case '\core\event\course_updated':
            case '\core\event\course_created':
            case '\core\event\config_log_created':
                \cache::make("theme_boost_training", "course_cache")->purge();
                \cache::make("theme_boost_training", "css_cache")->purge();
                \cache::make("theme_boost_training", "frontpage_cache")->purge();
                break;
        }
    }

    /**
     * Function course_module_deleted
     *
     * @param course_module_deleted $event
     *
     * @throws Exception
     */
    public static function course_module_deleted(course_module_deleted $event) {
        global $DB;

        if (!isset($event->other['coursemodule'])) {
            return;
        }

        $coursemodule = $event->other['coursemodule'];
        $sql = "
            SELECT *
              FROM {files}
             WHERE component   = 'theme_boost_training'
               AND filearea    = 'theme_boost_training_customicon'
               AND itemid      = :coursemodule
               AND filename LIKE '__%'";
        $files = $DB->get_records_sql($sql, ["coursemodule" => $coursemodule]);

        $fs = get_file_storage();
        foreach ($files as $file) {
            $f = $fs->get_file($file->contextid, $file->component, $file->filearea, $file->itemid, $file->filepath,
                $file->filename);
            $f->delete();
        }
    }
}
