fetch('/id').then(resp => resp.json())
    .then(data => {
        const params = new URLSearchParams(window.location.search);
        let locale = params.get('locale');
        if (locale === 'null') locale = null;
        let sdkLocale = '';
        if (locale) {
            const locUpper = locale.toUpperCase();
            if (locUpper === 'KZ') {
                sdkLocale = '&locale=ru_KZ';
            } else if (locUpper === 'US' || locUpper === 'GB' || locUpper === 'CA' || locUpper === 'AU') {
                sdkLocale = `&locale=en_${locUpper}`;
            }
        }
        const script = document.createElement('script');
        // Pass the locale to PayPal SDK.
        script.src = `https://www.paypal.com/sdk/js?client-id=${data.id}&components=buttons&enable-funding=venmo,paylater${sdkLocale}`;
        script.onload = function () {
            window.paypal.Buttons({
                style: {
                    shape: 'pill',
                    layout: 'vertical',
                },
                async createOrder(data, actions) {
                    try {
                        const response = await fetch("/api/orders", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ countryCode: locale })
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
                        console.log('loc', window.location.origin);
                        const orderData = await response.json();
                        const errorDetail = orderData?.details?.[0];

                        if (errorDetail?.issue === "INSTRUMENT_DECLINED") {
                            return actions.restart();
                        } else if (errorDetail) {
                            throw new Error(`${errorDetail.description} (${orderData.debug_id})`);
                        } else if (!orderData.purchase_units) {
                            throw new Error(JSON.stringify(orderData));
                        } else {
                            actions.redirect(`${window.location.origin}/paid`);
                            console.log('should redirect');
                        }
                    } catch (error) { console.error(error); }
                }
            })
                .render("#paypal-button-container");
        }
        document.body.appendChild(script);
    });

function resultMessage(message) {
    console.log('result msg:' + message);
}
