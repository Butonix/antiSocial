(function ($) {
	function loginController(elem, options) {
		this.element = $(elem);

		var self = this;
		this.start = function () {

			$('#login-form').on('shown.bs.modal', function () {
				$('#login-email-address').focus()
			});

			this.element.on('submit', function (e) {
				e.preventDefault();
				$.post('/api/MyUsers/login', {
						'email': self.element.find('[name="email"]').val(),
						'password': self.element.find('[name="password"]').val()
					})
					.done(function () {
						$('#login-form').modal('hide');
						flashAjaxStatus('info', 'logged in');
						loadPage('/feed');
						didLogIn();
					})
					.fail(function () {
						flashAjaxStatus('error', 'login failed');
					});
			});
		};

		this.stop = function () {
			$('#login-form').off('shown.bs.modal');
			this.element.off('submit');
		};
	}
	$.fn.loginController = GetJQueryPlugin('loginController', loginController);
})(jQuery);
