import express from "express";
import cors from "cors";
import fs from "fs";
import ExcelJS from "exceljs";

const app = express();

app.use(cors());
app.use(express.static("public"));

const PORT = 3000;


// =====================================
// SUPERMERCADOS
// =====================================
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


// =====================================
// CREAR CARPETA DATA
// =====================================
if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
}


// =====================================
// CREAR HISTORIAL
// =====================================
if (!fs.existsSync("./data/historial.json")) {

    fs.writeFileSync(
        "./data/historial.json",
        "[]"
    );
}


// =====================================
// CONSTRUIR LINKS
// =====================================
function construirLink(base, link) {

    if (!link) return "#";

    if (
        link.startsWith("http://") ||
        link.startsWith("https://")
    ) {
        return link;
    }

    return new URL(link, base).href;
}


// =====================================
// NORMALIZAR TEXTO
// =====================================
function limpiarTexto(texto = "") {

    return texto
        .toLowerCase()
        .trim();
}


// =====================================
// VALIDAR RELEVANCIA
// =====================================
function coincideBusqueda(nombre, busqueda) {

    const palabras =
        limpiarTexto(busqueda).split(" ");

    nombre =
        limpiarTexto(nombre);

    return palabras.every(p =>
        nombre.includes(p)
    );
}


// =====================================
// VALIDAR PRODUCTO
// =====================================
function productoValido(prod, query) {

    // =========================
    // NOMBRE
    // =========================
    if (
        !prod.nombre ||
        prod.nombre.length < 5
    ) {
        return false;
    }

    // =========================
    // PRECIO
    // =========================
    const precio =
        Number(prod.precio);

    if (
        !precio ||
        isNaN(precio) ||
        precio <= 0
    ) {
        return false;
    }

    // =========================
    // LINK
    // =========================
    if (
        !prod.link ||
        prod.link === "#"
    ) {
        return false;
    }

    // =========================
    // IMAGEN
    // =========================
    if (
        !prod.imagen ||
        !prod.imagen.startsWith("http")
    ) {
        return false;
    }

    // =========================
    // TEXTO COMPLETO
    // =========================
    const texto =
        `
        ${prod.nombre}
        `
        .toLowerCase();

    // =========================
    // PALABRAS BASURA
    // =========================
    const bloqueados = [

        // stock
        "sin stock",
        "agotado",
        "no disponible",
        "sin disponibilidad",

        // promos falsas
        "próximamente",
        "proximamente",

        // placeholders
        "imagen no disponible",

        // basura ecommerce
        "ver más",
        "ver mas",
        "comprar",
        "categorías",
        "categorias"

    ];

    const contieneBasura =
        bloqueados.some(p =>
            texto.includes(p)
        );

    if (contieneBasura) {
        return false;
    }

    // =========================
    // RELEVANCIA
    // =========================
    if (
        !coincideBusqueda(
            prod.nombre,
            query
        )
    ) {
        return false;
    }

    return true;
}


// =====================================
// ELIMINAR DUPLICADOS
// =====================================
function eliminarDuplicados(productos) {

    return productos.filter(
        (item, index, self) =>

            index === self.findIndex(p =>

                limpiarTexto(p.nombre) ===
                limpiarTexto(item.nombre)

                &&

                p.supermercado ===
                item.supermercado
            )
    );
}


// =====================================
// BUSCAR VTEX
// =====================================
async function buscarVTEX(superData, producto) {

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
                    prod.items?.[0];

                if (!item) return;

                const seller =
                    item.sellers?.[0];

                if (!seller) return;

                const offer =
                    seller.commertialOffer;

                if (!offer) return;

                // =====================
                // STOCK REAL
                // =====================
                const stock =
                    offer.AvailableQuantity || 0;

                if (stock <= 0) {
                    return;
                }

                // =====================
                // PRECIO
                // =====================
                const precio =
                    Number(offer.Price);

                if (
                    !precio ||
                    precio <= 0
                ) {
                    return;
                }

                const productoLimpio = {

                    fecha:
                        new Date()
                        .toISOString(),

                    supermercado:
                        superData.nombre,

                    nombre:
                        prod.productName,

                    precio,

                    stock,

                    link:
                        construirLink(
                            superData.api,
                            prod.link
                        ),

                    imagen:
                        item.images?.[0]?.imageUrl || ""
                };

                // =====================
                // VALIDAR PRODUCTO
                // =====================
                if (
                    productoValido(
                        productoLimpio,
                        producto
                    )
                ) {
                    resultados.push(
                        productoLimpio
                    );
                }

            } catch(err) {}
        });

        console.log(
            `${superData.nombre}: ${resultados.length} productos válidos`
        );

        return resultados;

    } catch (err) {

        console.log(
            `Error ${superData.nombre}`
        );

        return [];
    }
}


// =====================================
// GUARDAR HISTORIAL
// =====================================
function guardarHistorial(productos){

    try {

        const historial =
            JSON.parse(
                fs.readFileSync(
                    "./data/historial.json",
                    "utf8"
                )
            );

        historial.push(...productos);

        fs.writeFileSync(
            "./data/historial.json",
            JSON.stringify(
                historial,
                null,
                2
            )
        );

    } catch(err){

        console.log(
            "Error guardando historial"
        );
    }
}


// =====================================
// BUSCAR PRODUCTOS
// =====================================
app.get("/buscar", async (req, res) => {

    const q = req.query.q;

    if (!q) {
        return res.json([]);
    }

    const tareas =
        supermercados.map(s =>
            buscarVTEX(s, q)
        );

    const resultados =
        await Promise.all(tareas);

    let final =
        resultados.flat();

    // =========================
    // ELIMINAR DUPLICADOS
    // =========================
    final =
        eliminarDuplicados(final);

    // =========================
    // ORDENAR
    // =========================
    final.sort((a, b) =>
        a.precio - b.precio
    );

    guardarHistorial(final);

    res.json(final);
});


// =====================================
// EXPORTAR EXCEL
// =====================================
app.get("/exportar-excel", async (req, res) => {

    const historial =
        JSON.parse(
            fs.readFileSync(
                "./data/historial.json",
                "utf8"
            )
        );

    const workbook =
        new ExcelJS.Workbook();

    const sheet =
        workbook.addWorksheet("Historial");

    sheet.columns = [
        {
            header: "Fecha",
            key: "fecha",
            width: 25
        },
        {
            header: "Supermercado",
            key: "supermercado",
            width: 20
        },
        {
            header: "Producto",
            key: "nombre",
            width: 50
        },
        {
            header: "Precio",
            key: "precio",
            width: 15
        },
        {
            header: "Stock",
            key: "stock",
            width: 10
        },
        {
            header: "Link",
            key: "link",
            width: 60
        }
    ];

    historial.forEach(item => {
        sheet.addRow(item);
    });

    // =========================
    // FORMATO MONEDA
    // =========================
    sheet.getColumn("precio").numFmt =
        '"$"#,##0.00';

    const path =
        "./data/historial.xlsx";

    await workbook.xlsx.writeFile(path);

    res.download(path);
});


// =====================================
// INICIAR SERVIDOR
// =====================================
app.listen(PORT, () => {

    console.log(`
====================================
COMPARADOR PRO ACTIVO
http://localhost:${PORT}
====================================
`);
});