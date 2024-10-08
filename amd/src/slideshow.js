define([
    "jquery",
], function($) {
    var slideshow_boost_training = {

        slideIndex : 1,

        show       : function() {
            slideshow_boost_training.showSlides(slideshow_boost_training.slideIndex);

            setInterval(function() {
                slideshow_boost_training.plusSlides(1);
            }, 7000);

            $(".slideshow-prev").click(function() {
                slideshow_boost_training.plusSlides(-1);
            });
            $(".slideshow-next").click(function() {
                slideshow_boost_training.plusSlides(1);
            });

            $(".slideshow-dot").click(function() {
                slideshow_boost_training.slideIndex = $(this).attr("data-slidenun");
                slideshow_boost_training.showSlides(slideshow_boost_training.slideIndex);
            });
        },
        plusSlides : function(n) {
            slideshow_boost_training.showSlides(slideshow_boost_training.slideIndex += n);
        },
        showSlides : function(slideshow_num) {
            var slides_length = $(".slideshow-item").hide().length;
            if (slideshow_num > slides_length) {
                slideshow_boost_training.slideIndex = 1
            }
            if (slideshow_num < 1) {
                slideshow_boost_training.slideIndex = slides_length;
            }

            $(".slideshow-item-" + slideshow_boost_training.slideIndex).show();

            $(".slideshow-dot").removeClass("active");
            $(".slideshow-dot-" + slideshow_boost_training.slideIndex).addClass("active");
        }
    };

    return slideshow_boost_training;
});
