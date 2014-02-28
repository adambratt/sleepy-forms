// Setup jQuery Extenders

(function($){


  $.fn.extend({
    restForm: function (options) {

      /*
       * restForm
       *
       * This extension makes it easy to use REST endpoints with Bootstrap forms
       *
       * To initialize set data-form-handler="rest" as a form attribute or use:
       *
       *   $('#form-id').restForm(options);
       *
       * Where options is an object containing overrides for the settings
       * variable defined below.
       *
       *   @url 'string'          URL to which the form data will be submitted
       *   @type 'string'         Method type - POST, PUT, DELETE
       *   @excludeFields [array] List of field names to exclude from data processing
       *   @data {object}         Additional hardcoded data to include in the request
       *   @timeout (int)         Milliseconds before request should timeout
       *   @disableSubmit (bool)  Disables submit button until request returns
       *   @formErrorTarget (ele) Where to prepend any form-wide errors
       *
       *
       * TODO: We could make some of the field handling methods more CPU efficient
       * by using elements instead of field names.
       *
       */

      var self = $(this);

      var settings = {

        url: self.attr('action'),
        type: self.attr('method'),
        excludeFields: [],
        data: {},
        timeout: 30000,
        disableSubmit: true,
        formErrorTarget: null,

        /* Custom field handlers in the format:
          {
            password: {
             clear: function () {
                ... Code to clear errors before re-submitting ...
              },
              error: function (errors) {
                ... Code to handle and render errors ...
              },
              data: function () {
                ... Code to return the data value of this field ...
              }
            }
          }
        */
        fieldHandlers: {},

        // Prepares data to be submitted, takes data and returns processed data
        prepareData: function (dataObj) {
          return dataObj;
        },

        // Serializes form data - by default into JSON
        serializeData: function (data) {
          return JSON.stringify(data);
        },

        // Runs before the form is submitted via AJAX
        beforeSubmit: function () { },

        // Called immediately after AJAX is returned
        afterSubmit: function () { },

        // Clear overall form errors, Everything that's not a field
        clearFormErrors: function () {
          self.find('.form-error.alert-error').remove();
        },

        // Render overall form errors, Everything that's not a field
        renderFormErrors: function (errorArray) {
          var errorHTML = $("<div />").addClass('form-error alert alert-error').html(errorArray.join('<br>'));
          if (settings.formErrorTarget) {
            errorHTML.prependTo(settings.formErrorTarget);
          } else {
            errorHTML.prependTo(self);
          }
        },

        // Clear errors on a field
        clearFieldErrors: function (fieldName) {
          var controlGroup = self.find('[name='+fieldName+']').parents('.control-group');
          controlGroup.removeClass('error');
          controlGroup.find('.alert-error').remove();
        },

        // Renders errors for a field
        renderFieldErrors: function (fieldName, errorArray) {
          var field = self.find('[name='+fieldName+']');
          var errorHTML = $("<span />").addClass("help-inline ajax-error alert-error").text(errorArray.join('<br>'));
          field.parents('.control-group').addClass('error');
          errorHTML.insertAfter(field);
        },

        // Called on success
        success: function (data) { },

        // Fired after errors are processed
        afterError: function (error, level, jqXHR) {
          // Level is 0 by default, if it's higher you could log using sentry
        }

      };

      // Overwrite settings with supplied options
      $.extend(settings, options);


      /******************** Built-in Handlers **********************/

      var getFormData = function () {
        /*
         * Prepares form data object prior to serialization
         *
         * return @dataObj
         */

        // Load array of form fields
        var dataObj = {};
        var formData = self.serializeArray();

        // Loop through each form element
        for (var i = 0; i < formData.length; i++) {
          // Check to make sure this field isn't excluded
          if (!settings.excludeFields.length && $.inArray(formData[i].name,settings.excludeFields) == -1) {
            dataObj[formData[i].name] = formData[i].value;
          }
        }

        // Loop through custom fieldHandlers to add in data for custom fields
        $.each(settings.fieldHandlers, function (k, v) {
          if (v.data) {
            dataObj[k] = v.data();
          }
        });

        // Include extra data
        $.extend(dataObj, settings.data);

        // Run through custom prepareData function
        dataObj = settings.prepareData(dataObj);

        return dataObj;
      };


      var beforeSubmitCallback = function () {
        /*
         * Handles preparing the form before the submit process
         *
         */

        // Disable submit buttons until data is returned
        if (settings.disableSubmit) {
          self.find('[type=submit]').attr('disabled', 'disabled');
        }

        // Clear form errors
        settings.clearFormErrors();
        self.find('[name]').each( function () {
          var name = $(this).attr('name');
          if (settings.fieldHandlers[name] && settings.fieldHandlers[name].hasOwnProperty('clear')) {
            settings.fieldHandlers[name].clear()
          } else {
            settings.clearFieldErrors(name);
          }
        });

        settings.beforeSubmit();

      };


      var afterSubmitCallback = function () {
        /*
         * Handles misc changes to the form after a response is returned
         *
         */

        // Re-enable the submit buttons
        if (settings.disableSubmit) {
          // Give some time to render any form changes
          setTimeout(function () {
            self.find('[type=submit]').removeAttr('disabled')
          }, 200);
        }

        settings.afterSubmit();

      };


      var errorsCallback = function (errorObject) {
        /*
         * Called on AJAX errors that pass back a JSON object of fields
         *
         * @errorObject JSON object containing {field: [errors]}
         */
        $.each(errorObject, function (k, v) {

          // For form-level errors (not field) we use __all__ like Django Forms do
          if (k === '__all__') {
            settings.renderFormErrors(v);
            return;
          }

          // Check to see if custom error handler exists
          if (settings.fieldHandlers[k] && settings.fieldHandlers[k].error) {
            settings.fieldHandlers[k].error(v);
          } else {
            // Use default error renderer
            settings.renderFieldErrors(k, v);
          }

        });
      };

      /************************* Helper Functions *********************/

      var getJSONObject = function (jsonString) {
        /*
         * Makes sure that only a JSON object is returned
         *
         * return {obj} or false
         */
        try {
          var obj = $.parseJSON(jqXHR.responseText);
        } catch (e) {
          return false;
        }
        if (obj === null || typeof obj !== 'object') {
          return false;
        }
        return obj;
      };


      /*************** Handler on the .submit() listener **************/

      self.submit(function (e) {

        // Stop event propogation just to be safe
        e.stopPropagation();

        // Get form data
        var data = settings.serializeData(getFormData());

        // Call pre-submit handler
        beforeSubmitCallback();

        // Here it is, the holy grail. The actual request!!!
        $.ajax({
          url: settings.url,
          type: settings.type,
          timeout: settings.timeout,
          contentType: 'application/json',
          dataType: 'json',
          data: data,
          success: function (resp) {

            // Call post-submit handler
            afterSubmitCallback();
            settings.success(resp);

          },
          error: function (jqXHR, statusText) {

            // Call post-submit handler
            afterSubmitCallback();

            // See if this is just a normal HTTP error (will have JSON)
            var errors = getJSONObject(jqXHR.responseText);
            if (errors !== false) {
              errorsCallback(errors);
              settings.afterError(statusText, 0, jqXHR);
            }

            // Something else is going on, this needs more handling
            if (jqXHR.status === 0) {
              // Not connected to the internet
              errorsCallback({'__all__': ['Internet connection Lost']});
              settings.afterError(statusText, 1, jqXHR);

            } else {
              switch (statusText) {
                case 'parsererror': // Could not parse JSON form a normal response
                case 'timeout':     // Request timed out
                case 'abort':       // Ajax request aborted
                default:            // Uncaught error
                  errorsCallback({'__all__': [statusText]});
                  settings.afterError(statusText, 2, jqXHR);
                  break;
              }
            }

            // Log it because this is not an ordinary error
            console.log('AJAX Exception: ' + statusText);
            console.log(jqXHR);

          }
        });

        // Need this in addition to stopping event propagation
        return false;

      });

    }
  });

})(jQuery);
