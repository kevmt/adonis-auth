'use strict'

/*
 * adonis-auth
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const uuid = require('uuid')
const BaseScheme = require('./Base')
const GE = require('@adonisjs/generic-exceptions')
const CE = require('../Exceptions')

class ApiScheme extends BaseScheme {
  constructor (Encryption) {
    super()
    this.Encryption = Encryption
  }

  /* istanbul ignore next */
  /**
   * IoC container injections
   *
   * @method inject
   *
   * @return {Array}
   */
  static get inject () {
    return ['Adonis/Src/Encryption']
  }

  /**
   * Validate user credentials
   *
   * @method validate
   *
   * @param  {String} uid
   * @param  {String} password
   * @param  {Boolean} returnUser
   *
   * @return {Object}
   *
   * @throws {UserNotFoundException} If unable to find user with uid
   * @throws {PasswordMisMatchException} If password mismatches
   */
  async validate (uid, password, returnUser) {
    const user = await this._serializerInstance.findByUid(uid)
    if (!user) {
      throw CE.UserNotFoundException.invoke(`Cannot find user with ${this._config.uid} as ${uid}`)
    }

    const validated = await this._serializerInstance.validateCredentails(user, password)
    if (!validated) {
      throw CE.PasswordMisMatchException.invoke('Cannot verify user password')
    }

    return returnUser ? user : !!user
  }

  /**
   * Attempt to valid the user credentials and then
   * generates a new token for it.
   *
   * @method attempt
   *
   * @param  {String} uid
   * @param  {String} password
   *
   * @return {String}
   */
  async attempt (uid, password) {
    const user = await this.validate(uid, password, true)
    return this.generate(user)
  }

  /**
   * Generates a personal API token for a user
   *
   * @method generate
   * @async
   *
   * @param  {Object} user
   *
   * @return {Object}
   */
  async generate (user) {
    /**
     * Throw exception when user is not persisted to
     * database
     */
    const userId = user[this.primaryKey]
    if (!userId) {
      throw GE.RuntimeException.invoke('Primary key value is missing for user')
    }

    const plainToken = uuid.v4().replace(/-/g, '')
    await this._serializerInstance.saveToken(user, plainToken, 'api_token')

    /**
     * Encrypting the token before giving it to the
     * user.
     */
    const token = this.Encryption.encrypt(plainToken)

    return { type: 'bearer', token }
  }

  /**
   * Check whether the api token has been passed
   * in the request header and is it valid or
   * not.
   *
   * @method check
   *
   * @return {Boolean}
   */
  async check () {
    if (this.user) {
      return true
    }

    const token = this.getAuthHeader()
    if (!token) {
      throw CE.InvalidApiToken.invoke()
    }

    /**
     * Decrypting the token before querying
     * the db.
     */
    const plainToken = this.Encryption.decrypt(token)

    this.user = await this._serializerInstance.findByToken(plainToken, 'api_token')

    /**
     * Throw exception when user is not found
     */
    if (!this.user) {
      throw CE.InvalidApiToken.invoke()
    }
    return true
  }

  /**
   * Makes sure user is loggedin and then
   * returns the user back
   *
   * @method getUser
   *
   * @return {Object}
   */
  async getUser () {
    await this.check()
    return this.user
  }
}

module.exports = ApiScheme
