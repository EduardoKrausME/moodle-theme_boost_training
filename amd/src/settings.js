define(["jquery", "theme_boost_training/minicolors"], function($, minicolors) {
    var theme_boost_training = {

        minicolors: function(elementid) {
            $("#" + elementid).minicolors();
        }
    };

    return theme_boost_training;
});
