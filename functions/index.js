const functions = require("firebase-functions");

const app = require("express")();
const FBAuth = require("./util/fbAuth");

const { db, admin } = require("./util/admin");

const {
  signup,
  login,
  getUserdetails,
  getAuthenticatedUser,
  updateUserImage
} = require("./handlers/users");

const {
  postNewMenu,
  uploadImage,
  getAllmenus,
  getOneMenu,
  deleteMenu,
  likeMenu,
  unlikeMenu,
  updateMenu
} = require("./handlers/menus");

/**
 * Users Routes
 */
app.post("/signup", signup);
app.post("/login", login);
app.get("/user/:userName", getUserdetails);
app.get("/user", FBAuth, getAuthenticatedUser);
app.post("/user/image", FBAuth, updateUserImage);

/**
 * Menu Routes
 */
app.post("/menu", FBAuth, postNewMenu);
app.post("/menu/image", FBAuth, uploadImage);
app.get("/menus", getAllmenus);
app.get("/menu/:menuId", getOneMenu);
app.delete("/menu/:menuId", FBAuth, deleteMenu);
app.get("/menu/:menuId/like", FBAuth, likeMenu);
app.get("/menu/:menuId/unlike", FBAuth, unlikeMenu);
app.patch("/menu/:menuId/edit", FBAuth, updateMenu);

exports.api = functions.https.onRequest(app);

exports.onMenudelete = functions.firestore
  .document("/menus/{menuId}")
  .onDelete((snapshot, context) => {
    const menuId = context.params.menuId;
    const batch = db.batch();

    return db
      .collection("likes")
      .where("menuId", "==", menuId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`likes/${doc.id}`));
        });
        return batch.commit();
      })
      .catch(err => {
        console.log(err);
      });
  });
