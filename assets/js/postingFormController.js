(function ($) {
	function postingFormController(elem) {
		this.element = $(elem);
		var self = this;

		this.lastValue = '';

		this.endpoint = this.element.data('endpoint');
		this.about = this.element.data('about');
		this.photoId = this.element.data('photoId');
		this.renderer = new marked.Renderer();
		this.previewMode = false;
		this.currentTop = 0;
		self.categories = [];
		self.dropzone = undefined;

		this.renderer.link = function (href, title, text) {
			if (text && text.match(/^http/i)) {
				return '<div class="ogPreview" data-jsclass="OgTagPreview" data-src="/api/OgTags/scrape" data-url="' + href + '" data-type="json"></div>';
			}
			else {
				return '<a href="' + href + '" target="_blank">' + text + '</a>';
			}
		};

		this.start = function () {
			autosize(this.element.find('textarea'));

			if (self.element.find('.upload-zone')) {
				self.element.find('.upload-zone').addClass('dropzone').dropzone({
					'url': '/pending-upload',
					'autoProcessQueue': true,
					'parallelUploads': 1,
					'dictDefaultMessage': 'Drop photos here to attach to this post',
					'addRemoveLinks': true,
					'previewTemplate': '<div class="dz-preview dz-file-preview container-fluid"><div class="row"><div class="col-xs-3"><div class="dz-image"><img data-dz-thumbnail></div><div class="dz-details"><div class="dz-size"><span data-dz-size></span></div><div class="dz-filename"><span data-dz-name></span></div></div><div class="dz-progress"><span class="dz-upload" data-dz-uploadprogress></span></div><div class="dz-error-message"><span data-dz-errormessage></span></div></div><div class="metadata col-xs-9"><div class="form-group"><input type="text" class="form-control title" placeholder="Title"><br><textarea class="form-control description" type="text" placeholder="Description"></textarea></div></div></div>',
					init: function () {
						this.on('success', function (file, response) {
							file.serverPhotoId = response.id;
							//file.previewTemplate.appendChild(document.createTextNode(file.serverPhotoId));
							$(file.previewElement).data('photoId', response.id);

							var preview = _.get(response, 'uploads[0].imageSet.thumb.url');
							if (preview) {
								file.previewElement.querySelector('img').src = preview;
							}
						});
						this.on('removedfile', function (file) {
							var endpoint = '/api/MyUsers/me/photos/' + file.serverPhotoId;
							$.ajax({
								'method': 'DELETE',
								url: endpoint
							});
						});

						var thisDropzone = this;

						$.getJSON('/api/MyUsers/me/photos?filter=%7B%22where%22%3A%7B%22status%22%3A%22pending%22%7D%2C%22include%22%3A%5B%22uploads%22%5D%7D', function (data) {

							$.each(data, function (index, item) {

								var mockFile = {
									name: item.AttachmentID,
									size: 12345,
									serverPhotoId: item.id
								};

								// Call the default addedfile event handler
								thisDropzone.emit('addedfile', mockFile);

								// And optionally show the thumbnail of the file:
								thisDropzone.emit("thumbnail", mockFile, item.uploads[0].imageSet.thumb.url);
								thisDropzone.emit("complete", mockFile);
								thisDropzone.options.processing.call(thisDropzone, mockFile);
								thisDropzone.options.success.call(thisDropzone, mockFile);

							});
						});
					}
				});
			}


			self.element.find('.upload-zone').sortable({
				'placeholder': 'ui-state-highlight'
			});

			this.element.on('focus', this.element.data('focus-target'), function () {
				self.element.addClass('focused');
			});

			this.element.on('click', '#post-submit-button', function (e) {
				e.preventDefault();

				// collect id's of files in dropzone
				var photos = [];
				if (self.element.find('.upload-zone')) {
					var order = self.element.find('.upload-zone').find('.dz-complete');
					for (var i = 0; i < order.length; i++) {
						var photoId = $(order[i]).data('photoId');
						var photoTitle = $(order[i]).find('.title').val();
						var photoDescription = $(order[i]).find('.description').val();
						photos.push({
							'id': photoId,
							'title': photoTitle,
							'description': photoDescription
						});
					}
				}

				var geo = self.element.find('#geo-location').val();
				if (!geo) {
					geo = '{}';
				}
				geo = JSON.parse(geo);

				var payload = {
					'body': self.element.find('#posting-body').val(),
					'geoDescription': geo.description,
					'geoLocation': geo.loc,
					'visibility': self.element.find('#posting-visibility').val(),
					'categories': JSON.stringify(self.categories),
					'about': self.about,
					'photos': photos,
					'photoId': photoId
				};

				$.post(self.endpoint, payload, function (data, status, xhr) {
					if (status !== 'success') {
						flashAjaxStatus('error', xhr.statusText);
					}
					else {
						self.hideForm();
						flashAjaxStatus('info', 'post saved');
						if (data.rendered) {
							self.element.closest('.post').find('.comments-list').append(data.rendered);
							didInjectContent(self.element.closest('.post').find('.comments-list'));
						}
					}
				}, 'json');
			});

			this.element.on('click', '#post-cancel-button', function (e) {
				e.preventDefault();
				self.hideForm();
			});

			this.element.on('click', '#post-upload-button', function (e) {
				e.preventDefault();
				self.element.find('.upload-zone').toggle();
				didInjectContent(self.element);
			});

			this.element.on('click', '#post-geo-button', function (e) {
				e.preventDefault();
				if ($('.geo-zone').is(':visible')) {
					$('.geo-zone').find('input').val('');
				}
				self.element.find('.geo-zone').toggle();
				didInjectContent(self.element);
			});

			this.element.on('click', '#post-preview-button', function (e) {
				e.preventDefault();
				if (self.previewMode) {
					$(window).scrollTop(self.currentTop);
					self.previewMode = false;
					self.element.find('#form-tab').show();
					self.element.find('#preview-tab').hide();
					$(this).text('preview');
				}
				else {
					self.currentTop = $(window).scrollTop();
					self.renderPreview();
					self.previewMode = true;
					self.element.find('#form-tab').hide();
					self.element.find('#preview-tab').show();
					$(this).text('edit');
				}
			});

			this.hideForm = function () {
				self.element.removeClass('focused');
				self.element.find('#posting-body').val('');
				if (self.previewMode) {
					$('#post-preview-button').click();
				}

				if (self.endpoint !== '/comment') {
					$('body').trigger('DigitopiaReloadPage');
				}
			};
		};

		this.stop = function () {
			this.element.off('focusin', this.element.data('focus-target'));
			this.element.off('click', '#post-submit');
			this.element.off('click', '#post-cancel');
			this.element.off('click', '#post-preview');
			this.element.off('click', '#post-upload-button');
			this.element.off('click', '#post-geo-button');
		};

		this.renderPreview = function () {
			var markdown = self.element.find('#posting-body').val();

			markdown = self.parseTags(markdown);

			var rendered = marked(markdown, {
				renderer: self.renderer
			});
			var rendered = rendered.replace(/\<table\>/g, '<table class="table">');
			self.element.find('#preview-tab').empty().html(rendered);
			didInjectContent('#preview-tab');
		};

		this.parseTags = function (markdown) {
			self.categories = [];
			var tagged = markdown.replace(/\#([A-Za-z0-9\-\_\.])+/g, function (tag) {
				self.categories.push(tag.substr(1));
				return '[' + tag + '](' + tag + ')';
			});

			return tagged;
		}
	}

	$.fn.postingFormController = GetJQueryPlugin('postingFormController', postingFormController);
})(jQuery);
