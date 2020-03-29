const router = require("express").Router(),
    config = require("@config"),
    logger = require("@logger"),
    api = require("@api");

function signin(req, res) {
    req.signin(function (err, user, info) {
        if (user) {
            return res.status(200).json({}).end();
        } else {
            return res.error(400, { json: { message: info } });
        }
    });
}

router.get("/", function (req, res) {
    return res.render("index");
});

router.get("/gallery", async function (req, res) {
    if (res.locals.photoSets && res.locals.photoSets.length > 0) {
        return res.render("gallery/index");
    }

    // if there are still photos to display (unclassified) - then redirect to /gallery/all
    let allPhotos = await api.photos.all();
    if (allPhotos.length > 0) {
        return res.redirect("/gallery/all");
    }

    return res.error(404);
});

router.get("/gallery/:photoSet", async function (req, res) {
    let photoSet;

    if (req.params.photoSet !== "all") {
        photoSet = await api.photoSets.getWithPhotos(req.params.photoSet);
    } else {
        photoSet = {
            title: "All photos",
            code: "all",
            photos: await api.photos.all()
        };
    }

    if (!photoSet|| photoSet.photos.length === 0) {
        return res.error(404);
    }

    res.locals.model = {
        photoSet
    };
    return res.render("gallery/photoset");
});

router.get("/gallery/:photoSet/:photoId(\\d+)", async function (req, res) {
    let photoSet, photo;

    if (req.params.photoSet !== "all") {
        photoSet = await api.photoSets.get(req.params.photoSet);
    } else {
        photoSet = { title: "All photos", code: "all" };
    }

    photo = await api.photos.get(req.params.photoId);

    if (!photoSet || !photo) {
        return res.error(404);
    }

    let nextPhotoId, prevPhotoId;

    if (photoSet.code !== "all") {
        let photos = photoSet.photos,
            currentPhotoIndex = photos.indexOf(photo._id);
        
        nextPhotoId = currentPhotoIndex < photos.length - 1 ?
            photos[currentPhotoIndex + 1]
            : photos[0];
        
        prevPhotoId = currentPhotoIndex > 0 ?
            photos[currentPhotoIndex - 1]
            : photos[photos.length - 1];
    }

    res.locals.model = {
        photoSet,
        photo,
        nextPhotoId,
        prevPhotoId
    };

    return res.render("gallery/photo");
});

router.get("/signin", function (req, res) {
    if (req.isAuthenticated()) {
        return res.redirect("/dashboard");
    }
    if (req.xhr) {
        return res.error(404);
    } else {
        //return res.render('signin', { layout: false });
        return res.render("signin");
    }
});

router.get("/register", function (req, res) {
    if (req.isAuthenticated()) {
        return res.redirect("/dashboard");
    }
    if (req.xhr) {
        return res.error(404);
    } else {
        return res.render("register");
    }
});

router.get("/check-email", async function (req, res) {
    if (req.xhr) {
        var email = req.query.email,
            user = await api.users.get(email);
        res.send(!user);
    } else {
        return res.error(404);
    }
});

router.post("/signin", signin);

router.post("/register", async function (req, res) {
    if (req.isAuthenticated()) {
        return res.redirect("/dashboard");
    }

    let name = req.body.name,
        email = req.body.email,
        password = req.body.password,
        passwordConfirm = req.body.passwordConfirm;

    logger.info(`Register new user ${name} (${email})`);

    if (password !== passwordConfirm) {
        return res.error(400, { json: { message: "Password and confirm password does not match" } });
    }

    // check username
    if (await api.users.get(email)) {
        return res.error(400, { json: { message: "This email is already taken" } });
    }

    let security = require("@lib/security");
    let user = {
        name,
        email,
    };

    switch (config.passwordHashAlgorithm) {
        case "md5":
            user.password = security.md5(password);
            await api.users.add(user);
            signin(req, res);
            break;
        case "bcrypt":
            security.bcryptHash(password, async function (err, passwordHash) {
                user.password = passwordHash;
                await api.users.add(user);
                signin(req, res);
            });
            break;
        default:
            logger.error("Incorrect passwordHashAlgorithm specified in config.json");
            break;
    }
});

router.post("/send-message", async (req, res) => {
    let axios = require("axios");
    let text = `*${req.body.name}* (_${req.body.email}_) says:\n${req.body.message}`;
    await axios.post(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
        { chat_id: config.telegram.chatId, text, parse_mode: "Markdown" }
    );
    res.sendStatus(200);
});

router.get("/signout", function (req, res) {
    req.signout();
    return res.redirect("/");
});

router.get("/*", function (req, res) {
    let view = req.url.startsWith("/") ?  req.url.slice(1) : req.url,
        options = {};

    let renderCallback = function (err, html) {
        if (err) {
            console.log(err);
            if (err.message.indexOf("Failed to lookup view") !== -1) {
                return res.error(404, options);
            }
            throw err;
        }
        res.send(html);
    };

    return res.render(view, options, renderCallback);
});

module.exports = function (express) {
    express.use(async function (req, res, next) {

        let photoSets = await api.photoSets.notEmpty(),
            isGalleryVisible = photoSets.length > 0;

        if (!isGalleryVisible) {
            let allPhotos = await api.photos.all();
            isGalleryVisible = allPhotos.length > 0;
        }

        res.locals = res.locals || {};
        Object.assign(res.locals, {
            isGalleryVisible,
            photoSets
        });
        next();
    });

    return router;
};