const express = require('express');
const cors = require('cors');
const moment = require('moment');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

// password: 9auB5FU8fBIo1D3G
// DB_USER: surveyUser

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cj9n1qe.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const surveysCollection = client.db('SurveyDB').collection('surveys');
    const usersCollection = client.db('SurveyDB').collection('users');
    const paymentCollection = client.db("SurveyDB").collection("payments");

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // middlewares 
    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }


    // surveys api
    app.get('/surveys', async (req, res) => {
      const cursor = surveysCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get('/surveys/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await surveysCollection.findOne(query);
      res.send(result);
    })

    app.post('/surveys', async (req, res) => {
      const newSurvey = req.body;
      newSurvey.timestamp = new Date();
      console.log(newSurvey);
      const result = await surveysCollection.insertOne(newSurvey);
      res.send(result);
    })

    app.put('/surveys/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedSurvey = req.body;

      const survey = {
        $set: {
          title: updatedSurvey.title,
          question: updatedSurvey.question,
          description: updatedSurvey.description
        }
      }
      const result = await surveysCollection.updateOne(filter, survey, options);
      res.send(result);
    })

    app.patch('/surveys/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedSurvey = req.body;
      let result;
      console.log(updatedSurvey);

      if ('userFeedback' in updatedSurvey) {
        // Handle user feedback update
        const userFeedbackDoc = {
          $set: {
            userFeedback: updatedSurvey.userFeedback
          }
        };
        const result = await surveysCollection.updateOne(filter, userFeedbackDoc);
      }
      if ('adminFeedback' in updatedSurvey) {
        const updatedDoc = {
          $set: {
            adminFeedback: updatedSurvey.adminFeedback,
            status: updatedSurvey.status
          }
        };
        const result = await surveysCollection.updateOne(filter, updatedDoc);
      }

      if ('status' in updatedSurvey) {
        const updatedDoc = {
          $set: {
            status: updatedSurvey.status
          }
        };
        const result = await surveysCollection.updateOne(filter, updatedDoc);
      }
      if ('comments' in updatedSurvey) {
        const updatedDoc = {
          $set: {
            comments: updatedSurvey.comments
          }
        };
        const result = await surveysCollection.updateOne(filter, updatedDoc);
      }

      else {

        const updateDoc = {
          $set: {
            totalVoted: updatedSurvey.totalVoted,
            yesVoted: updatedSurvey.yesVoted,
            noVoted: updatedSurvey.noVoted,
            likes: updatedSurvey.likes,
            dislikes: updatedSurvey.dislikes,
            votersEmails: updatedSurvey.votersEmails,
            voters: updatedSurvey.voters,
          },
        };
        const result = await surveysCollection.updateOne(filter, updateDoc);

      }
      res.send(result);
    })




    // users

    app.post('/users', verifyToken, async (req, res) => {
      const newUser = req.body;
      console.log(newUser);
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    })
    app.get('/users', verifyToken, async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })


    app.put('/users/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedUser = req.body;

      const user = {
        $set: {
          role: updatedUser.role
        }
      }
      const result = await usersCollection.updateOne(filter, user);
      res.send(result);
    })

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    app.get('/payments', verifyToken, async (req, res) => {
      const cursor = paymentCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    app.post('/payments/:id', async (req, res) => {
      try {
          const payment = req.body;
          const paymentResult = await paymentCollection.insertOne(payment);
  
          // Carefully update the role of the user
          console.log('Payment info', payment);
  
          const id = req.params.id; 
          const filter = { _id: new ObjectId(id) };
          const updatedUser = req.body;
  
          const userUpdate = {
              $set: {
                  role: 'pro-user',
              }
          };
  
          const updateResult = await usersCollection.updateOne(filter, userUpdate);
  
          res.send({ paymentResult, updateResult });
      } catch (error) {
          console.error('Error processing payment and updating user role:', error.message);
          res.status(500).send('Internal Server Error');
      }
  });
  





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Survey snap is running')
})

app.listen(port, () => {
  console.log(`Survey snap Server is running on port ${port}`)
})
