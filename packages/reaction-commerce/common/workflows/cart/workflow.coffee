###
# Define cart workflow
###
CartWorkflow = StateMachine.create(
  initial: Session.get("CartWorkflow") || "new"
  events: [
    { name: "create", from: "new", to: "cart" }
    { name: "addToCart", from: "*", to: "cart" }
    { name: "cart", from: "create", to: "checkout" }
    { name: "checkout", from: "*", to: "login" }
    { name: "login", from: "checkout", to: "loggedin" }
    { name: "loggedin", from: "login", to: "addAddress" }
    { name: "addAddress", from: "loggedin", to: "shipmentAddress" }
    { name: "shipmentAddress", from: ["addAddress","paymentAddress","shipmentMethod","fetchShipmentMethods","payment"], to: "fetchShipmentMethods" }
    { name: "paymentAddress", from: ["addAddress","shipmentAddress","shipmentMethod","fetchShipmentMethods","payment"], to: "fetchShipmentMethods" }
    { name: "fetchShipmentMethods", from: "shipmentAddress", to: "shipmentMethods" }
    { name: "shipmentMethod", from: ["fetchShipmentMethods","payment"], to: "payment" }
    { name: "payment", from :["shipmentAddress","billingAddress","shipmentMethod"], to: "paymentAuth" }
    { name: "paymentAuth", from: "payment", to: "inventoryAdjust"}
    { name: "inventoryAdjust", from: "paymentAuth", to: "orderCreate"}
    { name: "orderCreate", from: "inventoryAdjust"  }
  ],
  callbacks: {
    onenterstate: (event, from, to) ->
      Session.set("CartWorkflow",to)

    oncreate: (event, from, to, sessionId, userId) ->
      # console.log "creating new cart"
      (sessionId = Session.get "sessionId") unless sessionId
      Meteor.call "createCart", cartSession: { sessionId:sessionId, userId:userId }

    onaddToCart: (event, from, to, cartSession, productId, variantData, quantity) ->
      if (cartSession? and productId?)
        Meteor.call "addToCart", cartSession, productId, variantData, quantity

    oncheckout: (event, from, to) ->
      Router.go "cartCheckout"

    onlogin: (event, from, to) ->
      #this handles already logged in users, Deps handles change of login
      if Meteor.userId() and Cart.findOne()?.state is "login"
        CartWorkflow.loggedin()

    onshipmentAddress: (event, from, to, address) ->
      # console.log address
      Cart.update Cart.findOne()._id, {$set:{"shipping.address":address}} if address

    onpaymentAddress: (event, from, to, address) ->
      # console.log address
      Cart.update Cart.findOne()._id, {$set:{"payment.address":address}} if address

    # onfetchshipmentMethods: (event, from, to) ->
    #   #we could get rates here

    onshipmentMethod: (event, from, to, method) ->
      Cart.update Cart.findOne()._id, {$set:{"shipping.shippingMethod":method}} if method
  }
)

###
# Enable reactivity on workflow
###
Deps.autorun ->
  state = Session.get("CartWorkflow")
  # console.log state
  if Cart.findOne()
    if state and state isnt "new" then Cart.update(Cart.findOne()._id,{$set:{state:state}})
    if state is "new"
      console.log "has existing state"
      Session.set("CartWorkflow", Cart.findOne()?.state)
    if state is "login" and Meteor.userId()
      # console.log "setting logged in"
      CartWorkflow.loggedin()