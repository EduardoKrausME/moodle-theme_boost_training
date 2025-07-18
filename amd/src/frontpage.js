define(["jquery", "core/modal_factory"], function ($, ModalFactory) {
    var frontpage = {
        init: function (lang) {
            frontpage.add_block(lang);
        },

        add_block: function (lang) {
            $("#frontpage_add_block").click(function () {
                ModalFactory
                    .create({
                        type: ModalFactory.types.DEFAULT,
                        title: $("#frontpage_add_block_modal").attr("data-title"),
                        body: '<div id="lista-modelos" class="d-flex flex-wrap row"></div>',
                        footer: "",
                    })
                    .done(function (modal) {
                        modal.modal.addClass('modal-dialog-centered modal-lg');

                        async function carregarArquivos() {
                            try {
                                const response = await fetch(`${M.cfg.wwwroot}/theme/boost_training/_editor/model/?lang=${lang}`);

                                if (!response.ok) {
                                    throw new Error("Erro ao carregar arquivos: " + response.status);
                                }

                                const $lista = $("#lista-modelos");
                                $lista.empty(); // Limpa o conteúdo anterior.

                                const dados = await response.json();
                                // Agrupar por tipo (parte antes do '-').
                                const grupos = {};
                                dados.forEach(function (item) {
                                    const tipo = item.id.includes('-') ? item.id.split('-')[0] : item.id;
                                    if (!grupos[tipo]) grupos[tipo] = [];
                                    grupos[tipo].push(item);
                                });

                                // Para cada grupo, renderizar seus itens.
                                Object.values(grupos).forEach(function (grupo) {
                                    let width = "";
                                    if (grupo.length === 4 || grupo.length === 8) {
                                        width = "col-md-3"; // 4 itens.
                                    } else if (grupo.length === 3 || grupo.length === 6) {
                                        width = "col-md-4"; // 3 itens.
                                    } else if (grupo.length === 2) {
                                        width = "col-md-6"; // 2 itens.
                                    } else if (grupo.length === 1) {
                                        width = "col-md-12"; // 1 itens.
                                    }

                                    grupo.forEach(function (item) {
                                        const bloco = $(`
                                            <div class="modelo-item ${width} text-center" role="button">
                                                <div class="modelo-item-border">
                                                    <img src="${item.image}" 
                                                         alt="${item.title}" 
                                                         class="img-fluid mb-2" style="width:100%;border:1px solid #ccc;border-radius:8px;">
                                                    <h5 style="font-size: 1rem;">${item.title}</h5>
                                                    <a href="${item.preview}" 
                                                       target="_blank">${M.util.get_string('preview', "theme_boost_training")}</a>
                                                </div>
                                            </div>`);
                                        $lista.append(bloco);
                                        bloco.find("a").click(function () {
                                            event.stopImmediatePropagation();
                                        })
                                        bloco.click(function () {
                                            let url = `${M.cfg.wwwroot}/theme/boost_training/_editor/editor.php?lang=${lang}&chave=home&dataid=create&local=home&template=${item.id}`
                                            location.href = url;
                                        });
                                    });
                                });
                            } catch (error) {
                                console.error("Erro na requisição:", error);
                            }
                        }

                        carregarArquivos();

                        modal.show();
                    })
            })
        }
    };

    return frontpage;
});
