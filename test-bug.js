// test-bug.js
function getUserData(req, res) {

    const body = JSON.parse(req.body);


    const sqlQuery = "SELECT * FROM users WHERE username = '" + body.username + "'";


    let mY_WeIrd_VaRiAbLe = 42;

    db.query(sqlQuery, (err, result) => {
        res.send(result);
    });
}