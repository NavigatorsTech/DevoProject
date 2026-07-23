import mongoose from 'mongoose'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  mongoose.connect(config.mongodbAccess)

  mongoose.connection.on('error', (err) => {
    console.error('mongo: connection error', err)
  })
  mongoose.connection.once('open', () => {
    console.log('mongo: connected to data store')
  })

  process.on('SIGINT', () => {
    mongoose.connection.close().then(() => {
      console.log('mongo: connection closed on app termination')
      process.exit(0)
    })
  })
})
