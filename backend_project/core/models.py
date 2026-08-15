from django.db import models

class Post(models.Model): #post is not used anywhere, just a sample model to test the setup
    title = models.CharField(max_length=200)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title