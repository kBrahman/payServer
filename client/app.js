window.paypal
  .Buttons({
    style: {
      shape: 'pill',
      //color:'blue', change the default color of the buttons
      layout: 'vertical', //default value. Can be changed to horizontal
    },
    async createOrder() {
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        const orderData = await response.json();
        if (orderData.id) return orderData.id;
        else {
          const errorDetail = orderData?.details?.[0];
          const errorMessage = errorDetail
            ? `${errorDetail.issue} ${errorDetail.description} (${orderData.debug_id})`
            : JSON.stringify(orderData);

          throw new Error(errorMessage);
        }
      } catch (error) {
        console.error(error);
        resultMessage(`Could not initiate PayPal Checkout...<br><br>${error}`);
      }
    },
    async onApprove(data, actions) {
      try {
        const response = await fetch(`/api/orders/${data.orderID}/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const orderData = await response.json();
        // Three cases to handle:
        //   (1) Recoverable INSTRUMENT_DECLINED -> call actions.restart()
        //   (2) Other non-recoverable errors -> Show a failure message
        //   (3) Successful transaction -> Show confirmation or thank you message

        const errorDetail = orderData?.details?.[0];

        if (errorDetail?.issue === "INSTRUMENT_DECLINED") {
          // (1) Recoverable INSTRUMENT_DECLINED -> call actions.restart()
          // recoverable state, per https://developer.paypal.com/docs/checkout/standard/customize/handle-funding-failures/
          return actions.restart();
        } else if (errorDetail) {
          // (2) Other non-recoverable errors -> Show a failure message
          throw new Error(`${errorDetail.description} (${orderData.debug_id})`);
        } else if (!orderData.purchase_units) {
          throw new Error(JSON.stringify(orderData));
        } else {
          // (3) Successful transaction -> Show confirmation or thank you message
          // Or go to another URL:  actions.redirect('thank_you.html');
          const transaction =
            orderData?.purchase_units?.[0]?.payments?.captures?.[0] ||
            orderData?.purchase_units?.[0]?.payments?.authorizations?.[0];
          resultMessage(transaction.status);
          console.log(
            "Capture result",
            orderData,
            JSON.stringify(orderData, null, 2)
          );
          OrderChannel.postMessage('COMPLETED');
        }
      } catch (error) {
        console.error(error);
        resultMessage(
          `Sorry, your transaction could not be processed...<br><br>${error}`
        );
      }
    },
    async onError(data, action){
      console.log('app err:'+data);
    }
  })
  .render("#paypal-button-container");

function resultMessage(message) {
  console.log('result msg:' + message);
}


function monitorIframe(iframe) {

  iframe.onload = function () {
    iframe.contentWindow.addEventListener('load', function () {
      OrderChannel.postMessage(iframe.contentWindow.location.href);
    });
    const observer = new MutationObserver(function () {
      OrderChannel.postMessage(iframe.contentWindow.location.href);
    });

    observer.observe(iframe.contentWindow.document, { subtree: true, childList: true});
  };
}

const observer = new MutationObserver(function(mutationsList, observer) {
  console.log('global observer init');
  for (let mutation of mutationsList) {
    if (mutation.type === 'childList') {
      const iframes = document.querySelectorAll('iframe[name^="__zoid__paypal_buttons__"][title="PayPal"]');
      if (iframes.length > 0) {
        const iframe = iframes[0];
        monitorIframe(iframe);
        observer.disconnect(); // Stop observing once the iframe is found and monitored
        break;
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });