const { default: mongoose } = require("mongoose");

const databasePassword = process.env.DATABASE_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;

const onDatabaseInit = () => {
  console.log('Connected to', databaseUrl);
};

mongoose.connect(
  databaseUrl,
  {
    user: 'multi-calendar',
    pass: databasePassword,
    autoCreate: true,
  },
  onDatabaseInit
);