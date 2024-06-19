import express from "express";
import bodyParser from "body-parser";
import ejs from "ejs";
import pg from "pg";
import env from "dotenv";
import { v4 as uuidv4 } from 'uuid';
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import bcrypt from "bcrypt";


const app = express();
const port = 3000;
const saltRounds = 10;
env.config();


app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret : process.env.SECRET_CODE,
    resave : false,
    saveUninitialized : true,
    cookie : {
        maxAge : 1000*60*60*24,
    } 
  })
);

app.use(passport.initialize());
app.use(passport.session());


const db = new pg.Client(
    {
        host : process.env.PG_HOST,
        user : process.env.PG_USER,
        password : process.env.PG_PASSWORD,
        database : process.env.PG_DB,
        port : process.env.PG_PORT,
    }
);
db.connect();


async function updateTable(currentTable, column, value, id, idCol){
    try{
        await db.query(`UPDATE ${currentTable} SET ${column} = '${value}' WHERE ${idCol} = ${id}`)
    }catch(err){
        console.log(err);
    }
}

async function fetchDataFromDatabase(todoName) {
    const query = `SELECT * FROM ${todoName}`;
    const rows = await db.query(query);
    return rows.rows;
}



async function defaultSelect(u_id){
    try{
        const result = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
        return await fetchDataFromDatabase(result.rows[0].tablename);
    }catch(err){
        console.log(err);
    }
}

async function deleteQUerie(table, column, delId){
    // console.log(delId, table, column);
    try{
        await db.query(`DELETE FROM ${table} WHERE ${column} = '${delId}'`);
    }catch(err){
        console.log(err);
    }
}

async function deleteTable(tablename){
    try{
        await db.query(`DROP TABLE ${tablename};`);
    }catch(err){
        console.log(err);
    }
}

// home page
app.get("/", async (req, res)=>{

    if(req.isAuthenticated()){
        try{

            const u_id = req.user.user_id;
            const todoCollection = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
            
            // if all todolist are deleted then one default todolist will be created
            // if(todoCollection.rows.length == 0){
            //     const u_id = req.user.user_id;
            //     const todoCollection = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
            //     const newTodoName = "today";
            //     const query = `CREATE TABLE ${newTodoName}(taskid SERIAL, taskName TEXT NOT NULL);`
            //     await db.query(query);
            //     const uuid = uuidv4();
            //     const result = await db.query("INSERT INTO ALLTODO VALUES($1,$2,$3)", [uuid, newTodoName, u_id]);
            //     req.session.dataFromDatabase = await fetchDataFromDatabase("today");
            // }
            // await defaultSelect(u_id)
            const todoTask = req.session.dataFromDatabase || [];
            console.log(todoTask);
            res.render("home.ejs", {
                todoTask : todoTask,
                todoList : todoCollection.rows,
                currentTodo : req.session.currentTodo || " ",
            });
        }catch(err){
            
            console.log(err);
        }
    }
    else{
        res.redirect("/login");
    }
    
});

// login page
app.get("/login", (req, res)=>{
    res.render("login.ejs");
});

// register page
app.get("/register", (req, res)=>{
    res.render("register.ejs");
});

// logout button 
app.get("/logout", (req, res)=>{
    req.logout((err)=>{
        if(err) console.log(err)
        res.redirect("/login");
    });
});

// manage todos button
app.get("/manageTodo", async (req, res)=>{
    

        try{
            const u_id = req.user.user_id;
            const todoCollection = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
            const listOfTodo = todoCollection.rows;
    
            res.render("manage_todo.ejs", {
                todoList: listOfTodo,
            });
    
        }catch(err){
            console.log(err);
        }
    
});

// addNewTodobutton
app.get("/addNewTodo", (req, res)=>{
        res.render("new_todo.ejs");
});


app.post(
    "/login",
    passport.authenticate("local", {
      successRedirect: "/",
      failureRedirect: "/login",
    })
  );



app.post("/register", async (req, res)=>{
    const userName = req.body["userName"];
    const email = req.body["email"];
    const password = req.body["password"];

    try{
        const result = await db.query("SELECT * FROM USERS WHERE EMAIL = $1", [email]);
        if(result.rows.length > 0){
            console.log("---email aleready exists try logging in---");
            res.redirect("/login");
        }else{
            bcrypt.hash(password, saltRounds, async (err, hash)=>{
                if(err){
                    console.log("Error while hashing password");
                }else{
                    const result = await db.query("INSERT INTO USERS(username, email, password_hash) VALUES($1, $2, $3) RETURNING *",
                     [userName, email, hash]);
                     const user = result.rows[0];
                     req.login(user, (err)=>{
                        console.log("Success");
                        res.redirect("/");
                      });
                }
            });
        }
    }catch(err){
        console.log(err);
    }
});

app.post("/add", async (req, res)=>{
    try{
        const currentTodo = req.session.currentTodo;
        const taskname = req.body['input_text'];
        const query = `INSERT INTO ${currentTodo}(TASKNAME) VALUES('${taskname}')`;
        await db.query(query);
        req.session.dataFromDatabase = await fetchDataFromDatabase(req.session.currentTodo);
        res.redirect("/");
    }catch(err){
        // console.log("Hello I am error",err);
        try{

            const u_id = req.user.user_id;
            const result = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
            req.session.currentTodo = result.rows[0].tablename;
            const taskname = req.body['input_text'];
            const query = `INSERT INTO ${req.session.currentTodo}(TASKNAME) VALUES('${taskname}')`;
            await db.query(query);
            req.session.dataFromDatabase = await fetchDataFromDatabase(req.session.currentTodo);
            res.redirect("/");

        }catch(err){
            console.log(err);
        }
    }
});


app.post("/addNewTodo", async (req, res)=>{
    try{
        const newTodoName = req.body["newTodoName"].split(' ').join('');
        const uuid = uuidv4();
        const u_id = req.user.user_id;
        const result = await db.query("INSERT INTO ALLTODO VALUES($1,$2,$3)", [uuid, newTodoName, u_id]);
        const query = `CREATE TABLE ${newTodoName}(taskid SERIAL, taskName TEXT NOT NULL);`
        await db.query(query);
        req.session.currentTodo = newTodoName;
        res.redirect("/");

    }catch(err){
        console.log(err);
    }
});

// update todolist Items
app.post("/update", async (req, res)=>{
    try{

        const value = req.body["input_text"];
        const id = req.body["input_id"];
        const currentTable = req.session.currentTodo || "today";
        const column = "taskname";
        const idCol = "taskid";
        
        // function to update values in a table in database
        await updateTable(currentTable, column, value, id, idCol);
        // update the values
        req.session.dataFromDatabase = await fetchDataFromDatabase(currentTable);
        res.redirect("/");
    }catch(err){
        console.log(err);
    }
});

// app.post("/updateTodo", (req, res)=>{
//     const text = req.body["input_text"];
//     const id = req.body["input_id"];
//     console.log(text);
//     for(let i = 0; i<listOfTodo.length; i++){
//         if(listOfTodo[i].id == id){
//             listOfTodo[i].todoName = text;
//         }
//     }
//     res.redirect("/manageTodo");
// });

// delete Todolist items
app.post("/delete", async (req, res)=>{
    setTimeout(
        async ()=>{

            try{
                const delId = req.body["input_id"];
                const table = req.session.currentTodo || "today";
                const column = "taskid";
        
                // function to delete items from database
                await deleteQUerie(table, column, delId);
        
                // update the values
                req.session.dataFromDatabase = await fetchDataFromDatabase(table);
                res.redirect("/");
            }catch(err){
                console.log(err);
            }
        },1800
    );
});

app.post("/deleteTodo", async (req, res)=>{
    try{
        const id = req.body["input_id"];
        console.log(id);
        const result = await fetchDataFromDatabase("alltodo");

        result.forEach(async (element) => {
            if(element.tableid == id){
                const table = element.tablename;
                console.log(table);
                await deleteTable(table);
            }
        });
        const table2 = "alltodo";
        const column = "tableid";

        await deleteQUerie(table2, column, id);
        res.redirect("/manageTodo");
    }catch(err){
        console.log(err);
    }

});

app.post("/deleteCurrentTodo", async (req, res)=>{
    try{

        const currentTodo = req.session.currentTodo;
        console.log(currentTodo);
        const query = `DROP TABLE ${currentTodo}`;
        await db.query(query);
        await db.query("DELETE FROM ALLTODO WHERE TABLENAME = $1",[currentTodo]);
        const u_id = req.user.user_id;
        const result = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
        if(result.rows.length > 0){
            req.session.dataFromDatabase = await fetchDataFromDatabase(result.rows[0].tablename);
            req.session.currentTodo = result.rows[0].tablename;
        }else{
            req.session.dataFromDatabase = [];
            req.session.currentTodo = '';
        }
        res.redirect("/");
    }catch(err){
        console.log("I am first errro",err);
        // try{

        //     const u_id = req.user.user_id;
        //     const result = await db.query("SELECT * FROM ALLTODO WHERE U_ID = $1", [u_id]);
        //     const currentTodo = req.session.currentTodo || "today";
        //     console.log(currentTodo);
        //     const query = `DROP TABLE ${currentTodo}`;
        //     await db.query(query);
        //     await db.query("DELETE FROM ALLTODO WHERE TABLENAME = $1",[currentTodo]);
        //     res.redirect("/");
        // }catch(err){
        //     console.log("I am second error",err);
        // }
    }
});


// selectTodo radio button
app.post("/selectTodo", async(req, res)=>{
    try{
        const radioValue = req.body["radioButtonName"];
        const result = await fetchDataFromDatabase(radioValue);
        req.session.dataFromDatabase = result;
        req.session.currentTodo  = radioValue;
        res.redirect("/");
    }catch(err){
        console.log(err);
        res.status(500).send("Error while fetching data from database");
    }
});


passport.use("local",
 new Strategy({
    usernameField: 'email',
    passwordField: 'password'
  },
    async function  verify(email, password, cb){
    try{
        const result = await db.query("SELECT * FROM USERS WHERE EMAIL = $1", [email]);
        console.log(result.rows[0]);
        
        if(result.rows.length>0){
            const user = result.rows[0];
            console.log(user);
            const storedHashedPassword = user.password_hash;
            bcrypt.compare(password, storedHashedPassword, (err, valid)=>{
                if(err){
                    console.log("error comparing password");
                    return cb(err);
                }else{
                    if(valid){
                        return cb(null, user);
                    }else{
                        return cb(null, false);
                    }
                }
            });
        }else{
            return cb("user not found");
        }
    }catch(err){
        return cb(err);
    }
}));




passport.serializeUser((user, cb) => {
    cb(null, user);
  });

passport.deserializeUser((user, cb) => {
    cb(null, user);
  });

app.listen(port, ()=>{
    console.log(`Listening on port ${port}`);
});