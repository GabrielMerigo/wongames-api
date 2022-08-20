"use strict";

const { createCoreService } = require("@strapi/strapi").factories;
const axios = require("axios");
const slugify = require("slugify");
const qs = require("querystring");

function Exception(e) {
  return { e, data: e.data && e.data.errors && e.data.errors };
}

async function getGameInfo(slug) {
  try {
    const jsdom = require("jsdom");
    const { JSDOM } = jsdom;
    const slugFormatted = slug.replaceAll("-", "_");

    const body = await axios.get(
      `https://www.gog.com/en/game/${slugFormatted}`
    );
    const dom = new JSDOM(body.data);
    const description = dom.window.document.querySelector(".description");

    return {
      rating: "Free",
      short_description: description.textContent.slice(0, 160),
      description: description.innerHTML,
    };
  } catch (e) {
    console.log("getByName", Exception(e));
  }
}

async function getByName(name, entityName) {
  try {
    const item = await strapi.service(`api::${entityName}.${entityName}`).find({
      publicationState: "preview",
      filters: {
        name,
      },
    });

    return item.results.length ? item.results[0] : null;
  } catch (e) {
    console.log("getByName", Exception(e));
  }
}

async function create(name, entityName) {
  try {
    const item = await getByName(name, entityName);

    if (!item) {
      await strapi.service(`api::${entityName}.${entityName}`).create({
        data: {
          published_at: new Date(),
          name: name,
          slug: slugify(name, { lower: true }),
        },
      });
    }
  } catch (e) {
    console.log("create", Exception(e));
  }
}

async function createManyToManyData(products) {
  try {
    const developers = {};
    const publishers = {};
    const categories = {};
    const platforms = {};

    products.forEach((product) => {
      const {
        developers: developer,
        publishers: publisher,
        genres,
        operatingSystems,
      } = product;

      genres &&
        genres.forEach(({ name }) => {
          categories[name] = true;
        });
      operatingSystems &&
        operatingSystems.forEach((item) => {
          platforms[item] = true;
        });

      developers[developer] = true;
      publishers[publisher] = true;
    });

    return Promise.all([
      ...Object.keys(developers).map((name) => create(name, "developer")),
      ...Object.keys(publishers).map((name) => create(name, "publisher")),
      ...Object.keys(categories).map((name) => create(name, "category")),
      ...Object.keys(platforms).map((name) => create(name, "platform")),
    ]);
  } catch (e) {
    console.log("create", Exception(e));
  }
}

async function setImage(imageUrl, game, field) {
  try {
    const { data } = await axios.get(imageUrl, { responseType: "arraybuffer" });

    const buffer = Buffer.from(data, "base64");

    const FormData = require("form-data");
    const formData = new FormData();

    formData.append("refId", game.id);
    formData.append("ref", "game");
    formData.append("field", field);
    formData.append("files", buffer, { filename: `${game.slug}.jpg` });

    console.info(`Uploading ${field} image: ${game.slug}.jpg`);

    const { data: imageUpdated } = await axios({
      method: "POST",
      url: `http://localhost:1337/api/upload`,
      data: formData,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      },
    });

    return imageUpdated[0].id;
  } catch (e) {
    console.log("create", Exception(e));
  }
}

async function createGames(products) {
  try {
    await Promise.all(
      products.map(async (product) => {
        const item = await getByName(product.title, "game");

        if (!item) {
          console.info(`Creating: ${product.title}...`);

          const idImageCover = await setImage(
            product.coverVertical,
            product,
            "cover"
          );
          const idImageGallery = await setImage(
            product.coverHorizontal,
            product,
            "gallery"
          );

          const game = await strapi.service("api::game.game").create({
            data: {
              name: product.title,
              slug: product.slug,
              price: product.price.finalMoney.amount,
              release_date: product.releaseDate.replaceAll(".", "-"),
              categories: await Promise.all(
                product.genres.map(({ name }) => getByName(name, "category"))
              ),
              platforms: await Promise.all(
                product.operatingSystems.map((name) =>
                  getByName(name, "platform")
                )
              ),
              cover: idImageCover,
              gallery: idImageGallery,
              developers: await getByName(product.developers[0], "developer"),
              publisher: await getByName(product.publishers[0], "publisher"),
              ...(await getGameInfo(product.slug)),
            },
          });

          console.info(`${product.title} Created`);
          return game;
        }
      })
    );
  } catch (e) {
    console.log("create", Exception(e));
  }
}

module.exports = createCoreService("api::game.game", ({ strapi }) => ({
  populate: async (params) => {
    try {
      const gogAPIUrl = `https://catalog.gog.com/v1/catalog?limit=48&price=between%3A80%2C380&order=desc%3Atrending&productType=in%3Agame%2Cpack&page=1&countryCode=BR&locale=en-US&currencyCode=BRL`;
      const {
        data: { products },
      } = await axios.get(gogAPIUrl);

      createManyToManyData(products);
      createGames(products);
    } catch (error) {
      console.log("create", Exception(e));
    }
  },
}));
