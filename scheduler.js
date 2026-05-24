import cron from "node-cron";
import fs from "fs";
import ExcelJS from "exceljs";

import db from "./database.js";
import { enviarTelegram } from "./telegram.js";

const supermercados = [
    {
        nombre: "Jumbo",
        api: "https://www.jumbo.com.ar/api/catalog_system/pub/products/search/?ft="
    },
    {
        nombre: "Disco",
        api: "https://www.disco.com.ar/api/catalog_system/pub/products/search/?ft="
    },
    {
        nombre: "Vea",
        api: "https://www.vea.com.ar/api/catalog_system/pub/products/search/?ft="
    },
    {
        nombre: "Carrefour",
        api: "https://www.carrefour.com.ar/api/catalog_system/pub/products/search/?ft="
    }
];

async function buscarProducto(superData, producto){

    try {

        const url =
            superData.api +
            encodeURIComponent(producto);

        const response =
            await fetch(url);

        const data =
            await response.json();

        const resultados = [];

        data.forEach(prod => {

            try {

                const item =
                    prod.items[0];

                const seller =
                    item.sellers[0];

                const offer =
                    seller.commertialOffer;

                resultados.push({

                    fecha:
                        new Date()
                        .toISOString()
                        .split("T")[0],

                    producto:
                        prod.productName,

                    supermercado:
                        superData.nombre,

                    precio:
                        offer.Price,

                    link:
                        prod.link
                });

            } catch {}
        });

        return resultados;

    } catch(err){

        return [];
    }
}

async function guardarProductos(){

    const productos =
        JSON.parse(
            fs.readFileSync(
                "./config/productos.json",
                "utf8"
            )
        );

    for(const producto of productos){

        console.log(
            "Buscando:",
            producto
        );

        const tareas =
            supermercados.map(s =>
                buscarProducto(s, producto)
            );

        const resultados =
            await Promise.all(tareas);

        const final =
            resultados.flat();

        final.forEach(item => {

            db.run(`
                INSERT INTO precios
                (
                    fecha,
                    producto,
                    supermercado,
                    precio,
                    link
                )
                VALUES (?, ?, ?, ?, ?)
            `,
            [
                item.fecha,
                item.producto,
                item.supermercado,
                item.precio,
                item.link
            ]);
        });

        if(final.length > 0){

            const mejor =
                final.sort(
                    (a,b) =>
                    a.precio - b.precio
                )[0];

            await enviarTelegram(`
🛒 ${producto}

💲 Mejor precio:
${mejor.supermercado}

$${mejor.precio}

${mejor.producto}
            `);
        }
    }

    generarExcel();
}

function generarExcel(){

    db.all(`
        SELECT *
        FROM precios
        ORDER BY fecha DESC
    `,
    async (err, rows) => {

        const workbook =
            new ExcelJS.Workbook();

        const sheet =
            workbook.addWorksheet(
                "Historial"
            );

        sheet.columns = [
            {
                header:"Fecha",
                key:"fecha",
                width:15
            },
            {
                header:"Producto",
                key:"producto",
                width:40
            },
            {
                header:"Supermercado",
                key:"supermercado",
                width:20
            },
            {
                header:"Precio",
                key:"precio",
                width:15
            }
        ];

        rows.forEach(r =>
            sheet.addRow(r)
        );

        await workbook.xlsx.writeFile(
            "./reports/reporte.xlsx"
        );

        console.log(
            "Excel generado"
        );
    });
}

cron.schedule("56 14 * * *", async () => {

    console.log(
        "Ejecutando tarea diaria..."
    );

    await guardarProductos();
});

console.log(
    "Scheduler iniciado"
);