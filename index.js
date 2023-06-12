const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const { query } = require('express');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middleware

app.use(cors());
app.use(express.json());

// MongoDB connection


const url = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sezawpu.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {

    
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('Unauthorized access')
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}


async function run() {

    try {
     

        // Tourism planner


        const serviceCollection = client.db("tourism_plannner").collection("services");
        const usersCollection = client.db("tourism_plannner").collection("users");
        const bookingsCollection = client.db("tourism_plannner").collection("bookings");
        const paymentsCollection = client.db("tourism_plannner").collection("payments");
     

        const verifyAdmin = async (req, res, next) => {
            // console.log(req.decoded.email)
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // Get all Services
        app.get('/services', async (req, res) => {
            const query = {};
            const services = await serviceCollection.find(query).toArray();       
            res.send(services);
        })

       

        app.get('/users',verifyJWT, verifyAdmin,  async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            // console.log(users);
            res.send(users);
        })

        app.get('/users/admin/:email',verifyJWT, verifyAdmin,  async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' })
        })

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin',
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.send(result);
        })

    

        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })
        app.get('/users/:email',verifyJWT, verifyAdmin,  async (req, res) => {
            const email = req.params.email
           
            const filter =  {
                email: email
            }
            const result = await usersCollection.findOne(filter);
            res.send(result);
        })



        app.get('/userbookings', verifyJWT,  async (req, res) => {
            const email = req.query.email;
            console.log(email)
      
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = {
                email: email
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray();
            res.send(alreadyBooked)
        })

        app.get('/alluserbookings', verifyJWT,  async (req, res) => {
           
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = {}
            const alreadyBooked = await bookingsCollection.find(query).toArray();
            res.send(alreadyBooked)
        })



        app.get('/booking/:id',verifyJWT, async(req,res)=>{
            const pid = req.params.id;
            const query = {_id: new ObjectId(pid) }
            const booking = await bookingsCollection.findOne(query)
            res.send(booking);
        })

        app.get('/servicedetails/:id', verifyJWT, async(req,res)=>{
            const pid = req.params.id;
            const query = {_id: new ObjectId(pid) }
            const service = await serviceCollection.findOne(query)
            res.send(service);
        })

        app.post('/bookings', async (req, res) => {

            const bookings = req.body;

            const query = {
                // appointmentDate: bookings.appointmentDate,
                service: bookings.service,
                email: bookings.email
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray()

            if (alreadyBooked.length > 0) {
                const message = `Oops! You have already Booking "${bookings.service}" packege.`
                return res.send({ acknowledged: false, message })
            }

            const result = await bookingsCollection.insertOne(bookings)
            res.send(result);


        })

        app.post('/create-payment-intent', async(req,res)=>{
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                 "payment_method_types": [
                    "card"
                 ]
            })
            // console.log(paymentIntent)
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async (req,res)=>{
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = {_id: new ObjectId(id)}
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transationId
                }
            }
            const updateResult =  await  bookingsCollection.updateOne(filter,updateDoc)
            res.send(result);
        })

        app.post('/updateservice', async (req,res)=>{
            const service = req.body;
            
            const id = service.id;
            const filter = {_id: new ObjectId(id)}
            const updateDoc = {
                $set: {
                    title:service.title, 
                    duration:service.duration,
                    description:service.description,
                    price:service.price,
                    image:service.image,
                }
            }
            const updateResult =  await  serviceCollection.updateOne(filter,updateDoc)
            res.send(updateResult);
        })
        app.delete('/service/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) };
            const result = await serviceCollection.deleteOne(filter);
            res.send(result);
        })

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '10h' });
                // console.log(token);
                return res.send({ accessToken: token })

            }
            res.status(403).send({ accessToken: 'access_token' })

        })

        app.post('/users', async (req, res) => {

            const user = req.body;
            // console.log(user)
            const result = await usersCollection.insertOne(user);
            res.send(result);

        })

     
            app.post('/services', verifyJWT, verifyAdmin, async (req, res) => {
            const service = req.body;
            
            const result = await serviceCollection.insertOne(service);
            // console.log(service)
            res.send(result);
        })
  

    }
    finally {

    }

}
run().catch(console.log);



// Default route
app.get('/', async (req, res) => {
    res.send('Tourism planner Server Running')
})





// Listen
app.listen(port, () => {
    console.log(`Server is running ${port}`);
})